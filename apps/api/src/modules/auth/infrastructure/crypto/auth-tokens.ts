import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { APP_CONFIG } from '../../../../config/config';
import type { AppConfig } from '../../../../config/config';
import { ApiException } from '../../../../platform/http/api-error';
import { USER_ROLES } from '../../../users';
import type { UserRoleName } from '../../../users';
import type {
  AuthenticatedPrincipal,
  ActionTokenPurpose,
} from '../../domain/auth.types';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}
export function validSecret(secret: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(secret);
}
export function tokenDigest(
  secret: string,
  purpose: ActionTokenPurpose | 'REFRESH' | 'RATE',
): string {
  return createHash('sha256')
    .update(`${purpose}:${secret}`, 'utf8')
    .digest('hex');
}

@Injectable()
export class AuthTokens {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  async issue(principal: AuthenticatedPrincipal): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ sid: principal.sessionId, roles: principal.roles })
      .setProtectedHeader({
        alg: 'HS256',
        typ: 'at+jwt',
        kid: this.config.auth.accessKeyId,
      })
      .setSubject(principal.userId)
      .setIssuer('vehicle-marketplace')
      .setAudience('marketplace-web')
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.auth.accessTtlSeconds)
      .sign(Buffer.from(this.config.auth.accessSecret, 'hex'));
  }
  async verify(token: string): Promise<AuthenticatedPrincipal> {
    const result = await this.verifyWithExpiry(token);
    return result.principal;
  }

  async verifyWithExpiry(
    token: string,
  ): Promise<{ principal: AuthenticatedPrincipal; expiresAt: Date }> {
    try {
      if (token.length > 4096) throw new Error('Oversize credential');
      const { payload } = await jwtVerify(
        token,
        (header) => {
          if (header.kid === this.config.auth.accessKeyId)
            return Buffer.from(this.config.auth.accessSecret, 'hex');
          if (
            this.config.auth.previousAccessSecret &&
            header.kid === this.config.auth.previousAccessKeyId
          )
            return Buffer.from(this.config.auth.previousAccessSecret, 'hex');
          throw new Error('Unknown signing key');
        },
        {
          algorithms: ['HS256'],
          issuer: 'vehicle-marketplace',
          audience: 'marketplace-web',
          typ: 'at+jwt',
          requiredClaims: ['sub', 'sid', 'roles', 'iat', 'exp'],
          maxTokenAge: this.config.auth.accessTtlSeconds,
          clockTolerance: 5,
        },
      );
      const roles: unknown = payload.roles;
      if (
        !payload.sub ||
        !UUID.test(payload.sub) ||
        typeof payload.sid !== 'string' ||
        !UUID.test(payload.sid) ||
        !Array.isArray(roles) ||
        roles.length > 3 ||
        !roles.every(
          (role: unknown) =>
            typeof role === 'string' &&
            USER_ROLES.some((known) => known === role),
        ) ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number' ||
        payload.exp - payload.iat > this.config.auth.accessTtlSeconds
      )
        throw new Error('Invalid claims');
      const narrowed: UserRoleName[] = USER_ROLES.filter((role) =>
        roles.includes(role),
      );
      return {
        principal: {
          userId: payload.sub,
          sessionId: payload.sid,
          roles: narrowed,
        },
        expiresAt: new Date(payload.exp * 1000),
      };
    } catch {
      throw new ApiException(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    }
  }
}
