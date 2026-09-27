import { Inject, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../../../platform/http/api-error';
import { UserIdentity, normalizeEmail } from '../../users';
import { AuditWriter } from '../../audit';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';
import { PasswordHasher } from '../infrastructure/crypto/password-hasher';
import { validateNewPassword } from '../domain/password-policy';
import type {
  CurrentUser,
  RequestSecurityContext,
  AuthenticatedPrincipal,
} from '../domain/auth.types';
import { SessionService } from './session.service';
import type { SessionGrant } from './session.service';
import { SecurityActionsService } from './security-actions.service';
import { requireActiveAccount } from './auth-account-policy';

@Injectable()
export class AccountAuthService {
  constructor(
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SecurityActionsService)
    private readonly actions: SecurityActionsService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}
  async register(
    input: { email: string; password: string; displayName: string },
    context: RequestSecurityContext,
  ): Promise<void> {
    validateNewPassword(input.password);
    const passwordHash = await this.passwords.hash(input.password);
    const account = {
      id: randomUUID(),
      emailNormalized: normalizeEmail(input.email),
      displayName: input.displayName.trim(),
    };
    try {
      const message = await this.persistence.transaction(async (manager) => {
        await this.users.createPendingAccount(account, manager);
        await this.persistence.createCredential(
          account.id,
          passwordHash,
          manager,
        );
        const message = await this.actions.issue(
          account,
          'EMAIL_VERIFICATION',
          context,
          manager,
        );
        await this.audit.append(
          {
            actorUserId: account.id,
            action: 'AUTH_REGISTERED',
            targetType: 'USER',
            targetId: account.id,
            requestId: context.requestId,
          },
          manager,
        );
        return message;
      });
      await this.actions.deliver(message);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driver: unknown = error.driverError;
        if (
          typeof driver === 'object' &&
          driver !== null &&
          'code' in driver &&
          driver.code === '23505' &&
          'constraint' in driver &&
          driver.constraint === 'uq_users_email_normalized'
        )
          throw new ApiException(
            409,
            'EMAIL_ALREADY_REGISTERED',
            'Email is already registered',
          );
      }
      throw error;
    }
  }
  private async failedLogin(context: RequestSecurityContext): Promise<void> {
    await this.audit.append({
      actorUserId: null,
      action: 'AUTH_LOGIN_FAILED',
      targetType: 'AUTH',
      targetId: '00000000-0000-4000-8000-000000000000',
      requestId: context.requestId,
      metadata: { reasonCode: 'SIGN_IN_DENIED' },
    });
  }
  async login(
    input: { email: string; password: string },
    context: RequestSecurityContext,
  ): Promise<SessionGrant> {
    const user = await this.users.findForAuthentication(
      normalizeEmail(input.email),
    );
    const credential = user
      ? await this.persistence.findCredentialForAuthentication(user.id)
      : null;
    if (
      !(await this.passwords.verify(
        credential?.passwordHash ?? null,
        input.password,
      )) ||
      !user ||
      !credential
    ) {
      await this.failedLogin(context);
      throw new ApiException(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }
    const rehash = this.passwords.needsRehash(credential.passwordHash)
      ? await this.passwords.hash(input.password)
      : null;
    try {
      return await this.persistence.transaction(async (manager) => {
        const current = await this.users.lockForAuthentication(
          user.id,
          manager,
        );
        const fresh = await this.persistence.findCredentialForAuthentication(
          user.id,
          manager,
        );
        if (
          !current ||
          !fresh ||
          fresh.passwordHash !== credential.passwordHash
        )
          throw new ApiException(
            401,
            'INVALID_CREDENTIALS',
            'Invalid email or password',
          );
        requireActiveAccount(current);
        if (rehash)
          await this.persistence.replacePassword(user.id, rehash, manager);
        const grant = await this.sessions.create(user.id, manager);
        await this.audit.append(
          {
            actorUserId: user.id,
            action: 'AUTH_LOGIN_SUCCEEDED',
            targetType: 'USER',
            targetId: user.id,
            requestId: context.requestId,
          },
          manager,
        );
        return grant;
      });
    } catch (error) {
      if (error instanceof ApiException) await this.failedLogin(context);
      throw error;
    }
  }
  async me(principal: AuthenticatedPrincipal): Promise<CurrentUser> {
    const user = await this.users.findForCurrentUser(principal.userId);
    if (!user)
      throw new ApiException(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.emailNormalized,
      status: user.status,
      roles: principal.roles,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }
}
