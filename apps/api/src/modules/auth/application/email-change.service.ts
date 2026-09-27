import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { QueryFailedError } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiException } from '../../../platform/http/api-error';
import { RealtimePublisher } from '../../../platform/realtime/realtime-publisher';
import { AuditWriter } from '../../audit';
import {
  EmailDeliveryRecords,
  EmailSender,
  renderEmail,
  type EmailTemplate,
} from '../../email-delivery';
import { UserIdentity, normalizeEmail } from '../../users';
import type {
  AuthenticatedPrincipal,
  RequestSecurityContext,
} from '../domain/auth.types';
import {
  newSecret,
  tokenDigest,
  validSecret,
} from '../infrastructure/crypto/auth-tokens';
import { PasswordHasher } from '../infrastructure/crypto/password-hasher';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';
import { requireActiveAccount } from './auth-account-policy';
import { sessionFailure } from '../domain/auth.types';

interface PreviewDelivery {
  id: string;
  to: string;
  template: EmailTemplate;
  payload: Record<string, unknown>;
}

@Injectable()
export class EmailChangeService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
    @Inject(EmailDeliveryRecords)
    private readonly deliveries: EmailDeliveryRecords,
    @Inject(EmailSender) private readonly sender: EmailSender,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async pending(userId: string): Promise<string | null> {
    const token = await this.persistence.findPendingEmailChange(userId);
    return token?.targetEmailNormalized ?? null;
  }

  async request(
    principal: AuthenticatedPrincipal,
    newEmailInput: string,
    currentPassword: string,
    context: RequestSecurityContext,
  ): Promise<void> {
    const credential = await this.persistence.findCredentialForAuthentication(
      principal.userId,
    );
    if (
      !credential ||
      !(await this.passwords.verify(credential.passwordHash, currentPassword))
    )
      throw new ApiException(
        400,
        'EMAIL_CHANGE_PASSWORD_INVALID',
        'Current password is incorrect',
      );
    const newEmail = normalizeEmail(newEmailInput);
    const preview = await this.persistence.transaction(async (manager) => {
      const user = await this.users.lockForAuthentication(
        principal.userId,
        manager,
      );
      const fresh = await this.persistence.findCredentialForAuthentication(
        principal.userId,
        manager,
      );
      const session = await this.persistence.findSession(
        principal.sessionId,
        manager,
        true,
      );
      if (
        !user ||
        !fresh ||
        fresh.passwordHash !== credential.passwordHash ||
        !session ||
        session.userId !== user.id ||
        sessionFailure(session, this.config.auth.refreshIdleSeconds, new Date())
      )
        throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'Sign in again');
      requireActiveAccount(user);
      if (newEmail === user.emailNormalized)
        throw new ApiException(
          409,
          'EMAIL_CHANGE_CONFLICT',
          'Email is already in use',
        );
      const owner = await this.users.findForAuthentication(newEmail, manager);
      if (owner)
        throw new ApiException(
          409,
          'EMAIL_CHANGE_CONFLICT',
          'Email is already in use',
        );
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + this.config.auth.verificationTtlSeconds * 1000,
      );
      const secret = newSecret();
      const tokenId = randomUUID();
      await this.persistence.revokeActions(
        user.id,
        'EMAIL_CHANGE',
        now,
        manager,
      );
      await this.deliveries.suppressPending(
        user.id,
        'EMAIL_CHANGE_CONFIRMATION',
        manager,
      );
      await this.persistence.addAction(
        {
          id: tokenId,
          userId: user.id,
          purpose: 'EMAIL_CHANGE',
          tokenHash: tokenDigest(secret, 'EMAIL_CHANGE'),
          expiresAt,
          targetEmailNormalized: newEmail,
          retainedSessionId: session.id,
        },
        manager,
      );
      const payload = {
        schemaVersion: 1,
        actionUrl: `${this.config.webUrl}/account/email-change/confirm#token=${secret}`,
        expiresAt: expiresAt.toISOString(),
        requestId: context.requestId,
      };
      const id = await this.deliveries.scheduleSecurity(
        {
          userId: user.id,
          template: 'EMAIL_CHANGE_CONFIRMATION',
          dedupeKey: `email-change-confirm:${tokenId}`,
          recipientEmail: newEmail,
          payload,
        },
        manager,
      );
      await this.audit.append(
        {
          actorUserId: user.id,
          action: 'AUTH_EMAIL_CHANGE_REQUESTED',
          targetType: 'USER',
          targetId: user.id,
          requestId: context.requestId,
        },
        manager,
      );
      return {
        id,
        to: newEmail,
        template: 'EMAIL_CHANGE_CONFIRMATION' as const,
        payload,
      };
    });
    await this.preview(preview);
  }

  async confirm(
    secret: string,
    context: RequestSecurityContext,
  ): Promise<void> {
    if (!validSecret(secret)) this.invalid();
    const digest = tokenDigest(secret, 'EMAIL_CHANGE');
    const candidate = await this.persistence.findAction(digest, 'EMAIL_CHANGE');
    if (!candidate) this.invalid();
    let outcome: { revoked: string[]; preview: PreviewDelivery };
    try {
      outcome = await this.persistence.transaction(async (manager) => {
        const user = await this.users.lockForAuthentication(
          candidate.userId,
          manager,
        );
        const token = await this.persistence.findAction(
          digest,
          'EMAIL_CHANGE',
          manager,
          true,
        );
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !token ||
          token.consumedAt ||
          token.revokedAt ||
          !token.targetEmailNormalized
        )
          this.invalid();
        const now = new Date();
        if (token.expiresAt <= now)
          throw new ApiException(
            400,
            'EMAIL_CHANGE_TOKEN_EXPIRED',
            'Email change link expired',
          );
        const conflict = await this.users.findForAuthentication(
          token.targetEmailNormalized,
          manager,
        );
        if (conflict && conflict.id !== user.id)
          throw new ApiException(
            409,
            'EMAIL_CHANGE_CONFLICT',
            'Email is already in use',
          );
        const oldEmail = user.emailNormalized;
        const revoked = await this.persistence.activeSessionIds(
          user.id,
          manager,
          token.retainedSessionId ?? undefined,
        );
        await this.users.changeEmail(
          user.id,
          token.targetEmailNormalized,
          now,
          manager,
        );
        await this.persistence.consumeAction(token.id, now, manager);
        await this.persistence.revokeAllUserSessions(
          user.id,
          now,
          manager,
          token.retainedSessionId ?? undefined,
        );
        const payload = { schemaVersion: 1 };
        const id = await this.deliveries.scheduleSecurity(
          {
            userId: user.id,
            template: 'EMAIL_CHANGED',
            dedupeKey: `email-changed:${token.id}`,
            recipientEmail: oldEmail,
            payload,
          },
          manager,
        );
        await this.audit.append(
          {
            actorUserId: user.id,
            action: 'AUTH_EMAIL_CHANGED',
            targetType: 'USER',
            targetId: user.id,
            requestId: context.requestId,
            metadata: { reasonCode: 'OTHER_SESSIONS_REVOKED' },
          },
          manager,
        );
        return {
          revoked,
          preview: {
            id,
            to: oldEmail,
            template: 'EMAIL_CHANGED' as const,
            payload,
          },
        };
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        typeof error.driverError === 'object' &&
        error.driverError !== null &&
        'code' in error.driverError &&
        error.driverError.code === '23505'
      )
        throw new ApiException(
          409,
          'EMAIL_CHANGE_CONFLICT',
          'Email is already in use',
        );
      throw error;
    }
    await Promise.all(
      outcome.revoked.map((id) => this.realtime.disconnectSession(id)),
    );
    await this.preview(outcome.preview);
  }

  private invalid(): never {
    throw new ApiException(
      400,
      'EMAIL_CHANGE_TOKEN_INVALID',
      'Email change link is invalid or already used',
    );
  }
  private async preview(delivery: PreviewDelivery): Promise<void> {
    if (this.config.emailDelivery.provider !== 'preview') return;
    try {
      const rendered = renderEmail(
        this.config,
        delivery.template,
        delivery.payload,
      );
      const result = await this.sender.send({
        to: delivery.to,
        template: delivery.template,
        ...rendered,
        messageId: `<${delivery.id}@marketplace.invalid>`,
        idempotencyKey: delivery.id,
        actionUrl: rendered.actionUrl ?? this.config.webUrl,
      });
      await this.deliveries.previewSent(
        delivery.id,
        result?.providerMessageId ?? null,
      );
    } catch {
      // The durable PENDING row remains available to worker:delivery.
    }
  }
}
