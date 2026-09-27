import { Inject, Injectable } from '@nestjs/common';
import { ApiException } from '../../../platform/http/api-error';
import { UserIdentity } from '../../users';
import { AuditWriter } from '../../audit';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';
import { PasswordHasher } from '../infrastructure/crypto/password-hasher';
import { validateNewPassword } from '../domain/password-policy';
import type {
  AuthenticatedPrincipal,
  RequestSecurityContext,
} from '../domain/auth.types';
import { SecurityActionsService } from './security-actions.service';
import { requireActiveAccount } from './auth-account-policy';
import { sessionFailure } from '../domain/auth.types';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';

@Injectable()
export class PasswordAuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
    @Inject(SecurityActionsService)
    private readonly actions: SecurityActionsService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}
  async reset(
    token: string,
    password: string,
    context: RequestSecurityContext,
  ): Promise<void> {
    validateNewPassword(password);
    const passwordHash = await this.passwords.hash(password);
    await this.actions.withValidToken(
      token,
      'PASSWORD_RESET',
      async (user, tokenId, manager, now) => {
        const credential =
          await this.persistence.findCredentialForAuthentication(
            user.id,
            manager,
          );
        if (!credential)
          throw new ApiException(
            400,
            'INVALID_PASSWORD_RESET_TOKEN',
            'Link is invalid or already used',
          );
        await this.persistence.replacePassword(user.id, passwordHash, manager);
        await this.persistence.consumeAction(tokenId, now, manager);
        await this.persistence.revokeAllUserSessions(user.id, now, manager);
        await this.audit.append(
          {
            actorUserId: user.id,
            action: 'AUTH_PASSWORD_RESET_COMPLETED',
            targetType: 'USER',
            targetId: user.id,
            requestId: context.requestId,
          },
          manager,
        );
      },
    );
  }
  async change(
    principal: AuthenticatedPrincipal,
    currentPassword: string,
    newPassword: string,
    context: RequestSecurityContext,
  ): Promise<void> {
    validateNewPassword(newPassword);
    const credential = await this.persistence.findCredentialForAuthentication(
      principal.userId,
    );
    if (
      !credential ||
      !(await this.passwords.verify(credential.passwordHash, currentPassword))
    )
      throw new ApiException(
        400,
        'INVALID_CURRENT_PASSWORD',
        'Current password is incorrect',
      );
    if (newPassword === currentPassword)
      throw new ApiException(
        400,
        'PASSWORD_UNCHANGED',
        'Choose a different password',
      );
    const passwordHash = await this.passwords.hash(newPassword);
    await this.persistence.transaction(async (manager) => {
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
      const now = new Date();
      await this.persistence.replacePassword(user.id, passwordHash, manager);
      // Preserve this session; all other devices and outstanding reset links are revoked.
      await this.persistence.revokeAllUserSessions(
        user.id,
        now,
        manager,
        session.id,
      );
      await this.persistence.revokeActions(
        user.id,
        'PASSWORD_RESET',
        now,
        manager,
      );
      await this.audit.append(
        {
          actorUserId: user.id,
          action: 'AUTH_PASSWORD_CHANGED',
          targetType: 'USER',
          targetId: user.id,
          requestId: context.requestId,
          metadata: { reasonCode: 'OTHER_SESSIONS_REVOKED' },
        },
        manager,
      );
    });
  }
}
