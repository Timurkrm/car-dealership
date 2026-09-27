import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiException } from '../../../platform/http/api-error';
import { RealtimePublisher } from '../../../platform/realtime/realtime-publisher';
import { AuditWriter } from '../../audit';
import { UserIdentity } from '../../users';
import type {
  AuthenticatedPrincipal,
  RequestSecurityContext,
} from '../domain/auth.types';
import { requireActiveAccount } from './auth-account-policy';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';

export interface AccountSessionView {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  current: boolean;
}

@Injectable()
export class AccountSessionsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async list(principal: AuthenticatedPrincipal): Promise<AccountSessionView[]> {
    const sessions = await this.persistence.listActiveSessions(
      principal.userId,
      this.config.auth.refreshIdleSeconds,
    );
    return sessions.map((session) => ({
      id: session.id,
      createdAt: new Date(session.createdAt).toISOString(),
      lastActivityAt: new Date(
        session.lastUsedAt ?? session.createdAt,
      ).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      current: session.id === principal.sessionId,
    }));
  }

  async revoke(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    context: RequestSecurityContext,
  ): Promise<{ current: boolean }> {
    await this.persistence.transaction(async (manager) => {
      const user = await this.users.lockForAuthentication(
        principal.userId,
        manager,
      );
      const session = await this.persistence.findSession(
        sessionId,
        manager,
        true,
      );
      if (!user || !session || session.userId !== user.id || session.revokedAt)
        throw new ApiException(404, 'SESSION_NOT_FOUND', 'Session not found');
      requireActiveAccount(user);
      await this.persistence.revokeSession(session.id, new Date(), manager);
      await this.audit.append(
        {
          actorUserId: user.id,
          action: 'AUTH_SESSION_REVOKED',
          targetType: 'USER_SESSION',
          targetId: session.id,
          requestId: context.requestId,
        },
        manager,
      );
    });
    await this.realtime.disconnectSession(sessionId);
    return { current: sessionId === principal.sessionId };
  }

  async revokeOthers(
    principal: AuthenticatedPrincipal,
    context: RequestSecurityContext,
  ): Promise<number> {
    const revoked = await this.persistence.transaction(async (manager) => {
      const user = await this.users.lockForAuthentication(
        principal.userId,
        manager,
      );
      const current = await this.persistence.findSession(
        principal.sessionId,
        manager,
        true,
      );
      if (!user || !current || current.userId !== user.id || current.revokedAt)
        throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'Sign in again');
      requireActiveAccount(user);
      const ids = await this.persistence.activeSessionIds(
        user.id,
        manager,
        current.id,
      );
      await this.persistence.revokeAllUserSessions(
        user.id,
        new Date(),
        manager,
        current.id,
      );
      await this.audit.append(
        {
          actorUserId: user.id,
          action: 'AUTH_OTHER_SESSIONS_REVOKED',
          targetType: 'USER',
          targetId: user.id,
          requestId: context.requestId,
          metadata: { reasonCode: 'USER_REQUEST' },
        },
        manager,
      );
      return ids;
    });
    await Promise.all(revoked.map((id) => this.realtime.disconnectSession(id)));
    return revoked.length;
  }
}
