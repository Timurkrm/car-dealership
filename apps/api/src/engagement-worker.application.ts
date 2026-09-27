import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config';
import { OutboxWorker } from './engagement/outbox-worker';

/** Process composition root for durable PostgreSQL outbox consumption. */
@Module({ providers: [OutboxWorker] })
export class EngagementWorkerApplication {
  static register(config: AppConfig): DynamicModule {
    return {
      module: EngagementWorkerApplication,
      imports: [AppModule.register(config)],
    };
  }
}
