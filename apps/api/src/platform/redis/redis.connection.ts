import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { createClient } from 'redis';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { StructuredLogger } from '../logging/structured-logger';

@Injectable()
export class RedisConnection implements OnModuleInit, OnApplicationShutdown {
  private readonly client;
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
        reconnectStrategy: (retries) =>
          Math.min(100 * 2 ** Math.min(retries, 5), 3000),
      },
      password: config.redis.password,
      disableOfflineQueue: true,
    });
    this.client.on('error', () =>
      this.logger.event('warn', 'Redis connection unavailable', {
        operation: 'redis_connection',
      }),
    );
  }
  async onModuleInit(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const connection = this.client.connect().then(() => {
      this.logger.event('info', 'Redis connected', {
        operation: 'redis_connect',
      });
    });
    try {
      await Promise.race([
        connection,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 3000);
        }),
      ]);
      if (!this.client.isReady)
        this.logger.event('warn', 'Redis startup degraded; reconnecting', {
          operation: 'redis_startup_degraded',
        });
    } catch {
      this.logger.event('warn', 'Redis startup degraded; reconnecting', {
        operation: 'redis_startup_degraded',
      });
    } finally {
      clearTimeout(timer);
    }
  }
  async check(): Promise<void> {
    if (!this.client.isReady) throw new Error('Redis not ready');
    const result = await this.client
      .withCommandOptions({ timeout: 3000 })
      .ping();
    if (result !== 'PONG') throw new Error('Redis ping failed');
  }
  /** Atomically consumes bounded fixed windows. Identifiers must already be opaque. */
  async consumeLimits(
    keys: string[],
    limits: number[],
    windowSeconds: number,
  ): Promise<number> {
    if (
      keys.length < 1 ||
      keys.length > 3 ||
      keys.length !== limits.length ||
      keys.some((key) => key.length > 200) ||
      limits.some((limit) => !Number.isInteger(limit) || limit < 1) ||
      !Number.isInteger(windowSeconds) ||
      windowSeconds < 1 ||
      windowSeconds > 86400
    )
      throw new RangeError('Invalid rate limit policy');
    if (!this.client.isReady) throw new Error('Rate store unavailable');
    const result = await this.client.withCommandOptions({ timeout: 3000 }).eval(
      `
      local retry = 0
      for i, key in ipairs(KEYS) do
        local count = redis.call('INCR', key)
        if count == 1 then redis.call('EXPIRE', key, ARGV[1]) end
        if count > tonumber(ARGV[i + 1]) then
          retry = math.max(retry, 1, redis.call('TTL', key))
        end
      end
      return retry`,
      { keys, arguments: [String(windowSeconds), ...limits.map(String)] },
    );
    if (typeof result !== 'number')
      throw new Error('Invalid rate store response');
    return result;
  }
  async onApplicationShutdown(): Promise<void> {
    // Do not wait behind an in-flight reconnect during the bounded process drain.
    if (this.client.isOpen) this.client.destroy();
    this.logger.event('info', 'Redis disconnected', {
      operation: 'redis_disconnect',
    });
  }
}
