import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth';
import { AuditModule } from '../audit';
import { MessagingModule } from '../messaging';
import { NotificationsModule } from '../notifications';
import { UsersModule } from '../users';
import { ListingModerationService } from './application/listing-moderation.service';
import { ReportModerationService } from './application/report-moderation.service';
import {
  ModerationListingsController,
  ModerationReportsController,
  ReportsController,
  SellerModerationResultController,
} from './http/moderation.controller';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';
import { ModerationActionWriter } from './application/moderation-action-writer';
import { OutboxModule } from '../outbox';

@Module({})
export class ModerationModule {
  static register(listings: DynamicModule): DynamicModule {
    return {
      module: ModerationModule,
      imports: [
        PlatformModule,
        AuthModule,
        AuditModule,
        MessagingModule,
        NotificationsModule,
        UsersModule,
        OutboxModule,
        listings,
      ],
      controllers: [
        ReportsController,
        ModerationListingsController,
        ModerationReportsController,
        SellerModerationResultController,
      ],
      providers: [
        ListingModerationService,
        ReportModerationService,
        RequestRateGuard,
        ModerationActionWriter,
      ],
      exports: [
        ListingModerationService,
        ReportModerationService,
        ModerationActionWriter,
      ],
    };
  }
}
