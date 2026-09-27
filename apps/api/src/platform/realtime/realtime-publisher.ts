import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import { createClient } from 'redis';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { StructuredLogger } from '../logging/structured-logger';
import { REALTIME_EVENTS, sessionRoom, userRoom } from './realtime-events';

@Injectable()
export class RealtimePublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly client;
  private emitter?: Emitter;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        ...(config.redis.tls
          ? { tls: true as const, rejectUnauthorized: true }
          : { tls: false as const }),
        connectTimeout: 3000,
        reconnectStrategy: false,
      },
      password: config.redis.password,
      disableOfflineQueue: true,
    });
    this.client.on('error', () => undefined);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.emitter = new Emitter(this.client);
    } catch {
      this.logger.event('warn', 'Realtime publisher unavailable', {
        operation: 'realtime_publisher_connect',
      });
    }
  }

  async users(
    userIds: readonly string[],
    event: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.emitter) return;
    try {
      await Promise.all(
        [...new Set(userIds)].map(async (id) => {
          this.emitter?.of('/realtime').to(userRoom(id)).emit(event, payload);
        }),
      );
    } catch {
      this.logger.event(
        'warn',
        'Realtime publish failed after durable commit',
        {
          operation: 'realtime_publish',
          context: event,
          resultCount: new Set(userIds).size,
        },
      );
    }
  }

  notificationCreated(userId: string, payload: unknown): Promise<void> {
    return this.users([userId], REALTIME_EVENTS.notificationCreated, payload);
  }
  async disconnectSession(sessionId: string): Promise<void> {
    if (!this.emitter) return;
    try {
      this.emitter
        .of('/realtime')
        .to(sessionRoom(sessionId))
        .disconnectSockets(true);
    } catch {
      this.logger.event('warn', 'Realtime session disconnect failed', {
        operation: 'realtime_session_disconnect',
        entityId: sessionId,
      });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) this.client.destroy();
  }
}
