import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { NotificationsModule } from './modules/notifications';
import { OutboxModule } from './modules/outbox';
import { OutboxEventProcessor } from './engagement/outbox-event-processor';
import { UsersModule } from './modules/users';
import { PlatformModule } from './platform/platform.module';

@Module({})
export class EngagementModule {
  static register(
    search: DynamicModule,
    favorites: DynamicModule,
    messaging: DynamicModule,
  ): DynamicModule {
    return {
      module: EngagementModule,
      imports: [
        PlatformModule,
        OutboxModule,
        NotificationsModule,
        UsersModule,
        search,
        favorites,
        messaging,
      ],
      providers: [OutboxEventProcessor],
      exports: [OutboxModule, OutboxEventProcessor],
    };
  }
}
