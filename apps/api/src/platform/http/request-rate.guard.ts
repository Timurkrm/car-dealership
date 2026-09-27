import { createHmac } from 'node:crypto';
import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { RedisConnection } from '../redis/redis.connection';
import { ApiException } from './api-error';

export const REQUEST_RATE_POLICIES = {
  catalog: { limit: 120, window: 60, actor: false },
  search: { limit: 180, window: 60, actor: false },
  searchGeo: { limit: 60, window: 60, actor: false },
  searchFacets: { limit: 20, window: 60, actor: false },
  searchMap: { limit: 60, window: 60, actor: false },
  listingPublic: { limit: 120, window: 60, actor: false },
  listingSeller: { limit: 120, window: 60, actor: true },
  listingWrite: { limit: 60, window: 60, actor: true },
  listingCreate: { limit: 10, window: 3600, actor: true },
  mediaUpload: { limit: 60, window: 3600, actor: true },
  mediaComplete: { limit: 60, window: 60, actor: true },
  reportWrite: { limit: 10, window: 3600, actor: true },
  moderationRead: { limit: 180, window: 60, actor: true },
  moderationWrite: { limit: 60, window: 60, actor: true },
  adminRead: { limit: 180, window: 60, actor: true },
  adminWrite: { limit: 40, window: 60, actor: true },
  engagementRead: { limit: 180, window: 60, actor: true },
  engagementWrite: { limit: 60, window: 60, actor: true },
  savedSearchCreate: { limit: 20, window: 3600, actor: true },
  notificationWrite: { limit: 120, window: 60, actor: true },
  messagingRead: { limit: 240, window: 60, actor: true },
  conversationCreate: { limit: 30, window: 3600, actor: true },
  messageSend: { limit: 60, window: 60, actor: true },
  messageRead: { limit: 180, window: 60, actor: true },
  accountRead: { limit: 180, window: 60, actor: true },
  accountWrite: { limit: 40, window: 60, actor: true },
} as const;
export type RequestRatePolicy = keyof typeof REQUEST_RATE_POLICIES;
const RATE = 'platform:request-rate';
export const RequestRate = (policy: RequestRatePolicy) =>
  SetMetadata(RATE, policy);

@Injectable()
export class RequestRateGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RedisConnection) private readonly redis: RedisConnection,
  ) {}

  async consume(
    policy: RequestRatePolicy,
    identifier: string,
  ): Promise<number> {
    const { limit, window } = REQUEST_RATE_POLICIES[policy];
    const digest = createHmac(
      'sha256',
      Buffer.from(this.config.auth.accessSecret, 'hex'),
    )
      .update(`request-rate:${policy}:${identifier}`)
      .digest('hex');
    try {
      return await this.redis.consumeLimits(
        [`request-rate:${this.config.database.name}:${policy}:${digest}`],
        [limit],
        window,
      );
    } catch {
      throw new ApiException(
        503,
        'RATE_LIMIT_UNAVAILABLE',
        'Service temporarily unavailable',
      );
    }
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    let policy = this.reflector.get<RequestRatePolicy>(
      RATE,
      context.getHandler(),
    );
    if (!policy) return true;
    const req = context
      .switchToHttp()
      .getRequest<Request & { principal?: { userId: string } }>();
    if (
      policy === 'search' &&
      ['bbox', 'lat', 'lng', 'radiusMeters'].some(
        (key) => req.query[key] !== undefined,
      )
    )
      policy = 'searchGeo';
    const identifier = REQUEST_RATE_POLICIES[policy].actor
      ? req.principal?.userId
      : (req.ip ?? req.socket.remoteAddress);
    if (!identifier)
      throw new ApiException(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication required',
      );
    const retry = await this.consume(policy, identifier);
    if (retry > 0) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(retry));
      throw new ApiException(429, 'RATE_LIMITED', 'Too many requests');
    }
    return true;
  }
}
