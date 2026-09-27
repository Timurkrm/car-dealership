import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiException } from '../../../platform/http/api-error';
import { StructuredLogger } from '../../../platform/logging/structured-logger';
import { UserIdentity, normalizeEmail } from '../../users';
import type { User } from '../../users';
import { AuditWriter } from '../../audit';
import {
  EmailDeliveryRecords,
  EmailSender,
  renderEmail,
  type EmailTemplate,
} from '../../email-delivery';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';
import {
  newSecret,
  tokenDigest,
  validSecret,
} from '../infrastructure/crypto/auth-tokens';
import type {
  ActionTokenPurpose,
  RequestSecurityContext,
} from '../domain/auth.types';

interface ScheduledSecurityEmail {
  deliveryId: string;
  to: string;
  template: EmailTemplate;
  payload: Record<string, unknown>;
}

@Injectable()
export class SecurityActionsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(EmailDeliveryRecords)
    private readonly deliveries: EmailDeliveryRecords,
    @Inject(EmailSender) private readonly sender: EmailSender,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}

  async issue(
    user: { id: string; emailNormalized: string },
    purpose: Extract<
      ActionTokenPurpose,
      'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
    >,
    context: RequestSecurityContext,
    manager: EntityManager,
  ): Promise<ScheduledSecurityEmail> {
    const now = new Date();
    const ttl =
      purpose === 'EMAIL_VERIFICATION'
        ? this.config.auth.verificationTtlSeconds
        : this.config.auth.resetTtlSeconds;
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const token = newSecret();
    const tokenId = randomUUID();
    await this.persistence.revokeActions(user.id, purpose, now, manager);
    await this.persistence.addAction(
      {
        id: tokenId,
        userId: user.id,
        purpose,
        tokenHash: tokenDigest(token, purpose),
        expiresAt,
      },
      manager,
    );
    const page =
      purpose === 'EMAIL_VERIFICATION' ? 'verify-email' : 'reset-password';
    const payload = {
      actionUrl: `${this.config.webUrl}/${page}#token=${token}`,
      expiresAt: expiresAt.toISOString(),
      requestId: context.requestId,
    };
    const template =
      purpose === 'EMAIL_VERIFICATION' ? 'VERIFY_EMAIL' : 'PASSWORD_RESET';
    const deliveryId = await this.deliveries.scheduleSecurity(
      {
        userId: user.id,
        template,
        dedupeKey: `auth-action:${tokenId}`,
        recipientEmail: user.emailNormalized,
        payload,
      },
      manager,
    );
    return {
      deliveryId,
      to: user.emailNormalized,
      template,
      payload: { schemaVersion: 1, ...payload },
    };
  }

  /** Local/test deterministic capture. Production is handled only by worker:delivery. */
  async deliver(message: ScheduledSecurityEmail | null): Promise<void> {
    if (!message || this.config.emailDelivery.provider !== 'preview') return;
    try {
      const rendered = renderEmail(
        this.config,
        message.template,
        message.payload,
      );
      const result = await this.sender.send({
        to: message.to,
        template: message.template,
        ...rendered,
        messageId: `<${message.deliveryId}@marketplace.invalid>`,
        idempotencyKey: message.deliveryId,
        actionUrl: rendered.actionUrl ?? this.config.webUrl,
      });
      await this.deliveries.previewSent(
        message.deliveryId,
        result?.providerMessageId ?? null,
      );
    } catch (error) {
      // The durable PENDING row remains available to worker:delivery.
      this.logger.event('warn', 'Auth email preview delivery failed', {
        operation: 'auth_email_delivery',
        entityId: message.deliveryId,
        context: message.template,
        errorType:
          error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
  }

  async request(
    email: string,
    purpose: Extract<
      ActionTokenPurpose,
      'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
    >,
    context: RequestSecurityContext,
  ): Promise<void> {
    const candidate = await this.users.findForAuthentication(
      normalizeEmail(email),
    );
    const message = await this.persistence.transaction(async (manager) => {
      const user = candidate
        ? await this.users.lockForAuthentication(candidate.id, manager)
        : null;
      const eligible =
        user &&
        (purpose === 'EMAIL_VERIFICATION'
          ? user.status === 'PENDING_VERIFICATION' && !user.emailVerifiedAt
          : user.status === 'ACTIVE' || user.status === 'PENDING_VERIFICATION');
      if (purpose === 'PASSWORD_RESET')
        await this.audit.append(
          {
            actorUserId: null,
            action: 'AUTH_PASSWORD_RESET_REQUESTED',
            targetType: 'AUTH',
            targetId: '00000000-0000-4000-8000-000000000000',
            requestId: context.requestId,
            metadata: { reasonCode: 'RECOVERY_REQUEST' },
          },
          manager,
        );
      return eligible && user
        ? this.issue(user, purpose, context, manager)
        : null;
    });
    await this.deliver(message);
  }

  async withValidToken<T>(
    secret: string,
    purpose: Extract<
      ActionTokenPurpose,
      'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
    >,
    work: (
      user: User,
      tokenId: string,
      manager: EntityManager,
      now: Date,
    ) => Promise<T>,
  ): Promise<T> {
    const invalid =
      purpose === 'EMAIL_VERIFICATION'
        ? 'INVALID_VERIFICATION_TOKEN'
        : 'INVALID_PASSWORD_RESET_TOKEN';
    if (!validSecret(secret))
      throw new ApiException(400, invalid, 'Link is invalid or already used');
    const digest = tokenDigest(secret, purpose);
    const candidate = await this.persistence.findAction(digest, purpose);
    if (!candidate)
      throw new ApiException(400, invalid, 'Link is invalid or already used');
    return this.persistence.transaction(async (manager) => {
      const user = await this.users.lockForAuthentication(
        candidate.userId,
        manager,
      );
      const token = await this.persistence.findAction(
        digest,
        purpose,
        manager,
        true,
      );
      if (
        !user ||
        !token ||
        token.consumedAt ||
        token.revokedAt ||
        user.status === 'BLOCKED' ||
        user.status === 'SUSPENDED'
      )
        throw new ApiException(400, invalid, 'Link is invalid or already used');
      const now = new Date();
      if (token.expiresAt <= now)
        throw new ApiException(
          400,
          purpose === 'EMAIL_VERIFICATION'
            ? 'VERIFICATION_TOKEN_EXPIRED'
            : 'PASSWORD_RESET_TOKEN_EXPIRED',
          'Link expired; request a new one',
        );
      return work(user, token.id, manager, now);
    });
  }

  async confirmEmail(
    secret: string,
    context: RequestSecurityContext,
  ): Promise<void> {
    await this.withValidToken(
      secret,
      'EMAIL_VERIFICATION',
      async (user, tokenId, manager, now) => {
        if (user.emailVerifiedAt)
          throw new ApiException(
            400,
            'INVALID_VERIFICATION_TOKEN',
            'Link is invalid or already used',
          );
        await this.users.confirmEmail(user, now, manager);
        await this.persistence.consumeAction(tokenId, now, manager);
        await this.audit.append(
          {
            actorUserId: user.id,
            action: 'AUTH_EMAIL_VERIFIED',
            targetType: 'USER',
            targetId: user.id,
            requestId: context.requestId,
          },
          manager,
        );
      },
    );
  }
}
