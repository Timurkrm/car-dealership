import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { RedisConnection } from '../../../platform/redis/redis.connection';
import { ApiException } from '../../../platform/http/api-error';
import { normalizeEmail } from '../../users';
import { AuthPersistence } from '../infrastructure/persistence/auth.persistence';
import { tokenDigest } from '../infrastructure/crypto/auth-tokens';
import { readRefreshCookie } from './refresh-cookie';

export const AUTH_RATE_POLICIES = {
  register: { window: 3600, ip: 10, identity: 3 },
  login: { window: 900, ip: 40, identity: 10 },
  refresh: { window: 60, ip: 120, identity: 30 },
  verification: { window: 3600, ip: 20, identity: 3 },
  forgot: { window: 3600, ip: 20, identity: 3 },
  reset: { window: 900, ip: 20, identity: 5 },
  confirm: { window: 900, ip: 30, identity: 5 },
  change: { window: 900, ip: 20, identity: 5 },
  logout: { window: 60, ip: 120, identity: 30 },
} as const;
export type AuthRatePolicy = keyof typeof AUTH_RATE_POLICIES;
const RATE_METADATA = 'auth:rate';
export const AuthRate = (policy: AuthRatePolicy) =>
  SetMetadata(RATE_METADATA, policy);
@Injectable()
export class AuthRateLimiter {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RedisConnection) private readonly redis: RedisConnection,
  ) {}
  key(policy: AuthRatePolicy, dimension: string, identifier: string): string {
    const digest = createHmac(
      'sha256',
      Buffer.from(this.config.auth.accessSecret, 'hex'),
    )
      .update(`auth-rate:${policy}:${dimension}:${identifier}`)
      .digest('hex');
    return `auth-rate:${this.config.database.name}:${policy}:${dimension}:${digest}`;
  }
  async consume(
    policy: AuthRatePolicy,
    ip: string,
    identity: string | null,
  ): Promise<void> {
    const limits = AUTH_RATE_POLICIES[policy];
    const keys = [this.key(policy, 'ip', ip)];
    const counts: number[] = [limits.ip];
    if (identity) {
      keys.push(this.key(policy, 'identity', identity));
      counts.push(limits.identity);
    }
    let retry: number;
    try {
      retry = await this.redis.consumeLimits(keys, counts, limits.window);
    } catch {
      throw new ApiException(
        503,
        'AUTH_RATE_LIMIT_UNAVAILABLE',
        'Authentication temporarily unavailable',
      );
    }
    if (retry > 0)
      throw new ApiException(
        429,
        'AUTH_RATE_LIMITED',
        `Too many attempts; retry in ${retry} seconds`,
      );
  }
}
@Injectable()
export class AuthRateGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthRateLimiter) private readonly limiter: AuthRateLimiter,
    @Inject(AuthPersistence) private readonly persistence: AuthPersistence,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.get<AuthRatePolicy>(
      RATE_METADATA,
      context.getHandler(),
    );
    if (!policy) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const body: unknown = req.body;
    let identity: string | null = null;
    if (
      body &&
      typeof body === 'object' &&
      'email' in body &&
      typeof body.email === 'string'
    )
      identity = normalizeEmail(body.email.slice(0, 320));
    else if (
      body &&
      typeof body === 'object' &&
      'token' in body &&
      typeof body.token === 'string'
    )
      identity = tokenDigest(body.token.slice(0, 128), 'RATE');
    else {
      const cookie = readRefreshCookie(req);
      if (cookie)
        identity =
          (await this.persistence.locateRefresh(tokenDigest(cookie, 'REFRESH')))
            ?.sessionId ?? tokenDigest(cookie, 'RATE');
    }
    try {
      await this.limiter.consume(
        policy,
        req.ip ?? req.socket.remoteAddress ?? 'unknown',
        identity,
      );
    } catch (error) {
      if (error instanceof ApiException && error.getStatus() === 429) {
        const seconds =
          /retry in (\d+) seconds/.exec(error.safeMessage)?.[1] ?? '60';
        context
          .switchToHttp()
          .getResponse<Response>()
          .setHeader('Retry-After', seconds);
      }
      throw error;
    }
    return true;
  }
}
