import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { MessageModerationRecords } from './application/message-moderation-records';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth';
import { UsersModule } from '../users';
import { OutboxModule } from '../outbox';
import { ConversationCommands } from './application/conversation-commands';
import { ConversationQueries } from './application/conversation-queries';
import { MessageCommands } from './application/message-commands';
import { MessageEventReader } from './application/message-event-reader';
import { MessagingController } from './http/messaging.controller';
import { MessagingGateway } from './realtime/messaging.gateway';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';

@Module({
  providers: [MessageModerationRecords],
  exports: [MessageModerationRecords],
})
export class MessagingModule {
  static register(listings: DynamicModule): DynamicModule {
    return {
      module: MessagingModule,
      imports: [
        PlatformModule,
        AuthModule,
        UsersModule,
        OutboxModule,
        listings,
      ],
      controllers: [MessagingController],
      providers: [
        MessageModerationRecords,
        ConversationCommands,
        ConversationQueries,
        MessageCommands,
        MessageEventReader,
        MessagingGateway,
        RequestRateGuard,
      ],
      exports: [MessageModerationRecords, MessageEventReader],
    };
  }
}
