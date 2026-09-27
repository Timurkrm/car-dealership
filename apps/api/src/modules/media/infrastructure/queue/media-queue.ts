import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import {
  Queue,
  RedisConnection as BullRedisConnection,
  createNodeRedisClient,
} from 'bullmq';
import { createClient } from 'redis';
import type { ConnectionOptions } from 'bullmq';
import { APP_CONFIG } from '../../../../config/config';
import type { AppConfig } from '../../../../config/config';
import { StructuredLogger } from '../../../../platform/logging/structured-logger';
import { PROCESSING_ATTEMPTS } from '../../domain/media-policy';
// BullMQ 6 supports the repository's node-redis driver; owned connections close with Queue/Worker.
BullRedisConnection.clientFactory = (options) =>
  createNodeRedisClient(
    createClient({
      socket: {
        host: options.host,
        port: options.port,
        connectTimeout: 3000,
        ...(options.tls
          ? { tls: true as const, rejectUnauthorized: true }
          : {}),
        reconnectStrategy: (retries) => Math.min(200 * (retries + 1), 3000),
      },
      password: options.password,
      disableOfflineQueue: options.enableOfflineQueue === false,
      commandsQueueMaxLength: 1000,
      ...(options.enableOfflineQueue === false
        ? { commandOptions: { timeout: 3000 } }
        : {}),
    }),
  );
export function queueConnection(
  config: AppConfig,
  worker = false,
): ConnectionOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    ...(config.redis.tls ? { tls: { rejectUnauthorized: true } } : {}),
    connectTimeout: 3000,
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  };
}
export function queueName(config: AppConfig): string {
  return `media-${config.database.name}`;
}
export interface MediaJob {
  mediaId: string;
}
@Injectable()
export class MediaProcessingQueue implements OnApplicationShutdown {
  private queue?: Queue<MediaJob>;
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}
  getQueue(): Queue<MediaJob> {
    if (!this.queue) {
      this.queue = new Queue<MediaJob>(queueName(this.config), {
        connection: queueConnection(this.config),
        defaultJobOptions: {
          attempts: PROCESSING_ATTEMPTS,
          backoff: { type: 'exponential', delay: 1000, jitter: 0.25 },
          removeOnComplete: true,
          removeOnFail: { age: 86400, count: 1000 },
          stackTraceLimit: 0,
        },
      });
      this.queue.on('error', () =>
        this.logger.event('warn', 'Media queue unavailable', {
          operation: 'media_queue',
        }),
      );
    }
    return this.queue;
  }
  async enqueue(mediaId: string): Promise<void> {
    await this.boundedAdd(
      this.getQueue().add(
        'process',
        { mediaId },
        { jobId: `process-${mediaId}` },
      ),
    );
  }
  async enqueueCleanup(mediaId: string): Promise<void> {
    await this.boundedAdd(
      this.getQueue().add(
        'cleanup',
        { mediaId },
        { jobId: `cleanup-${mediaId}`, removeOnFail: true },
      ),
    );
  }
  private async boundedAdd(operation: Promise<unknown>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Media queue dispatch timed out')),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async enqueueBestEffort(mediaId: string): Promise<void> {
    try {
      await this.enqueue(mediaId);
    } catch {
      this.logger.event('warn', 'Media processing dispatch deferred', {
        operation: 'media_dispatch',
        entityId: mediaId,
      });
    }
  }
  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}
