import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiException } from '../../../platform/http/api-error';
import { UserIdentity } from '../../users';
import { AuditWriter } from '../../audit';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';
import {
  AuthTokens,
  newSecret,
  tokenDigest,
  validSecret,
} from '../infrastructure/crypto/auth-tokens';
import { sessionFailure } from '../domain/auth.types';
import type {
  AuthenticatedPrincipal,
  RequestSecurityContext,
} from '../domain/auth.types';
import { requireActiveAccount } from './auth-account-policy';

export interface SessionGrant {
  accessToken: string;
  expiresIn: number;
  refreshSecret: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(AuthTokens) private readonly tokens: AuthTokens,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}
  async create(userId: string, manager: EntityManager): Promise<SessionGrant> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.auth.refreshTtlSeconds * 1000,
    );
    const secret = newSecret();
    await this.persistence.createSession(
      { id, userId, expiresAt, lastUsedAt: now },
      manager,
    );
    await this.persistence.addRefresh(
      { sessionId: id, tokenHash: tokenDigest(secret, 'REFRESH'), expiresAt },
      manager,
    );
    const roles = await this.users.rolesFor(userId, manager);
    const accessToken = await this.tokens.issue({
      userId,
      sessionId: id,
      roles,
    });
    return {
      accessToken,
      expiresIn: this.config.auth.accessTtlSeconds,
      refreshSecret: secret,
      refreshExpiresAt: expiresAt,
    };
  }
  async refresh(
    secret: string | null,
    context: RequestSecurityContext,
  ): Promise<SessionGrant> {
    if (!secret || !validSecret(secret))
      throw new ApiException(
        401,
        'INVALID_REFRESH_TOKEN',
        'Session unavailable',
      );
    const digest = tokenDigest(secret, 'REFRESH');
    const locator = await this.persistence.locateRefresh(digest);
    if (!locator)
      throw new ApiException(
        401,
        'INVALID_REFRESH_TOKEN',
        'Session unavailable',
      );
    // Consistent order: account -> session -> token. Reset/logout-all use the same account lock.
    const outcome = await this.persistence.transaction<
      { failure: string } | { grant: SessionGrant }
    >(async (manager) => {
      const user = await this.users.lockForAuthentication(
        locator.userId,
        manager,
      );
      const session = await this.persistence.findSession(
        locator.sessionId,
        manager,
        true,
      );
      const token = await this.persistence.findRefresh(digest, manager);
      if (
        !user ||
        !session ||
        !token ||
        token.sessionId !== session.id ||
        session.userId !== user.id
      )
        throw new ApiException(
          401,
          'INVALID_REFRESH_TOKEN',
          'Session unavailable',
        );
      const now = new Date();
      if (token.consumedAt && !session.revokedAt) {
        await this.persistence.revokeSession(session.id, now, manager);
        await this.audit.append(
          {
            actorUserId: user.id,
            action: 'AUTH_REFRESH_REUSE_DETECTED',
            targetType: 'USER_SESSION',
            targetId: session.id,
            requestId: context.requestId,
            metadata: { reasonCode: 'CONSUMED_TOKEN_REPLAY' },
          },
          manager,
        );
        // Return failure so transaction commits revocation/audit before an HTTP exception.
        return { failure: 'REFRESH_TOKEN_REUSED' as const };
      }
      requireActiveAccount(user);
      const failure = sessionFailure(
        session,
        this.config.auth.refreshIdleSeconds,
        now,
      );
      if (failure) throw new ApiException(401, failure, 'Session unavailable');
      if (token.revokedAt || token.expiresAt <= now)
        throw new ApiException(
          401,
          'INVALID_REFRESH_TOKEN',
          'Session unavailable',
        );
      await this.persistence.consumeRefresh(token.id, session.id, now, manager);
      const replacement = newSecret();
      await this.persistence.addRefresh(
        {
          sessionId: session.id,
          tokenHash: tokenDigest(replacement, 'REFRESH'),
          expiresAt: session.expiresAt,
        },
        manager,
      );
      const accessToken = await this.tokens.issue({
        userId: user.id,
        sessionId: session.id,
        roles: await this.users.rolesFor(user.id, manager),
      });
      await this.audit.append(
        {
          actorUserId: user.id,
          action: 'AUTH_SESSION_REFRESHED',
          targetType: 'USER_SESSION',
          targetId: session.id,
          requestId: context.requestId,
        },
        manager,
      );
      return {
        grant: {
          accessToken,
          expiresIn: this.config.auth.accessTtlSeconds,
          refreshSecret: replacement,
          refreshExpiresAt: session.expiresAt,
        },
      };
    });
    if ('failure' in outcome)
      throw new ApiException(401, outcome.failure, 'Session unavailable');
    return outcome.grant;
  }
  async authenticate(accessToken: string): Promise<AuthenticatedPrincipal> {
    const signed = await this.tokens.verify(accessToken);
    return this.authenticatePrincipal(signed);
  }
  async authenticateRealtime(accessToken: string): Promise<{
    principal: AuthenticatedPrincipal;
    expiresAt: Date;
  }> {
    const signed = await this.tokens.verifyWithExpiry(accessToken);
    return {
      principal: await this.authenticatePrincipal(signed.principal),
      expiresAt: signed.expiresAt,
    };
  }
  private async authenticatePrincipal(
    signed: AuthenticatedPrincipal,
  ): Promise<AuthenticatedPrincipal> {
    const [user, session] = await Promise.all([
      this.users.findForCurrentUser(signed.userId),
      this.persistence.findSession(signed.sessionId),
    ]);
    if (!user || !session || session.userId !== user.id)
      throw new ApiException(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    requireActiveAccount(user);
    const failure = sessionFailure(
      session,
      this.config.auth.refreshIdleSeconds,
      new Date(),
    );
    if (failure) throw new ApiException(401, failure, 'Session unavailable');
    // Current persisted roles override JWT claims: removal is effective on the next request.
    return {
      userId: user.id,
      sessionId: session.id,
      roles: await this.users.rolesFor(user.id),
    };
  }
  async logout(
    secret: string | null,
    context: RequestSecurityContext,
  ): Promise<void> {
    if (!secret || !validSecret(secret)) return;
    const locator = await this.persistence.locateRefresh(
      tokenDigest(secret, 'REFRESH'),
    );
    if (!locator) return;
    await this.persistence.transaction(async (manager) => {
      const user = await this.users.lockForAuthentication(
        locator.userId,
        manager,
      );
      if (!user) return;
      const session = await this.persistence.findSession(
        locator.sessionId,
        manager,
        true,
      );
      if (!session || session.revokedAt) return;
      await this.persistence.revokeSession(session.id, new Date(), manager);
      await this.audit.append(
        {
          actorUserId: user.id,
          action: 'AUTH_LOGGED_OUT',
          targetType: 'USER_SESSION',
          targetId: session.id,
          requestId: context.requestId,
        },
        manager,
      );
    });
  }
  async logoutAll(
    principal: AuthenticatedPrincipal,
    context: RequestSecurityContext,
  ): Promise<void> {
    await this.persistence.transaction(async (manager) => {
      const user = await this.users.lockForAuthentication(
        principal.userId,
        manager,
      );
      if (!user)
        throw new ApiException(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication required',
        );
      const session = await this.persistence.findSession(
        principal.sessionId,
        manager,
        true,
      );
      if (
        !session ||
        session.userId !== user.id ||
        sessionFailure(session, this.config.auth.refreshIdleSeconds, new Date())
      )
        throw new ApiException(
          401,
          'AUTHENTICATION_REQUIRED',
          'Authentication required',
        );
      requireActiveAccount(user);
      await this.persistence.revokeAllUserSessions(
        user.id,
        new Date(),
        manager,
      );
      await this.audit.append(
        {
          actorUserId: user.id,
          action: 'AUTH_LOGGED_OUT_ALL',
          targetType: 'USER',
          targetId: user.id,
          requestId: context.requestId,
        },
        manager,
      );
    });
  }
  cleanup(limit = 500): Promise<{ sessions: number; actions: number }> {
    return this.persistence.cleanup(new Date(), limit);
  }
}
