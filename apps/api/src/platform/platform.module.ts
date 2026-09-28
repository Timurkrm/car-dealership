import { Module } from '@nestjs/common';
import { DatabaseConnection } from './database/database.connection';
import { RedisConnection } from './redis/redis.connection';
import { ObjectStorage } from './storage/object-storage';
import { StructuredLogger } from './logging/structured-logger';
import { OpaqueCursor } from './http/opaque-cursor';
import { RealtimePublisher } from './realtime/realtime-publisher';
import { ProcessLifecycle } from './runtime/process-lifecycle';
import { MetricsRegistry } from './observability/metrics.registry';

@Module({
  providers: [
    DatabaseConnection,
    RedisConnection,
    ObjectStorage,
    StructuredLogger,
    OpaqueCursor,
    RealtimePublisher,
    ProcessLifecycle,
    MetricsRegistry,
  ],
  exports: [
    DatabaseConnection,
    RedisConnection,
    ObjectStorage,
    StructuredLogger,
    OpaqueCursor,
    RealtimePublisher,
    ProcessLifecycle,
    MetricsRegistry,
  ],
})
export class PlatformModule {}
