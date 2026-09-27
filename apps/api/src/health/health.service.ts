import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../platform/database/database.connection';
import { RedisConnection } from '../platform/redis/redis.connection';
import { StructuredLogger } from '../platform/logging/structured-logger';
import { ProcessLifecycle } from '../platform/runtime/process-lifecycle';

export interface ReadinessResult {
  status: 'ok' | 'unavailable';
}
@Injectable()
export class HealthService {
  constructor(
    @Inject(DatabaseConnection)
    private readonly database: Pick<DatabaseConnection, 'check'>,
    @Inject(RedisConnection)
    private readonly redis: Pick<RedisConnection, 'check'>,
    @Inject(StructuredLogger)
    private readonly logger: Pick<StructuredLogger, 'event'>,
    @Inject(ProcessLifecycle)
    private readonly lifecycle: Pick<ProcessLifecycle, 'current'>,
  ) {}
  async ready(): Promise<ReadinessResult> {
    if (this.lifecycle.current === 'shutting_down')
      return { status: 'unavailable' };
    const results = await Promise.allSettled([
      this.database.check(),
      this.redis.check(),
    ]);
    const databaseUp = results[0].status === 'fulfilled';
    const redisUp = results[1].status === 'fulfilled';
    if (!databaseUp)
      this.logger.event('warn', 'Database readiness failed', {
        operation: 'database_readiness',
      });
    if (!redisUp)
      this.logger.event('warn', 'Redis dependency degraded', {
        operation: 'redis_degraded',
      });
    return { status: databaseUp ? 'ok' : 'unavailable' };
  }
}
