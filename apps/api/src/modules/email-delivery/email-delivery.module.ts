import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { PlatformModule } from '../../platform/platform.module';
import { UsersModule } from '../users';
import { EmailDeliveryRecords } from './application/email-delivery-records';
import { NotificationPreferencesService } from './application/notification-preferences.service';
import {
  EmailSender,
  HttpEmailSender,
  PreviewEmailSender,
} from './infrastructure/email/email-sender';

@Module({
  imports: [PlatformModule, UsersModule],
  providers: [
    EmailDeliveryRecords,
    NotificationPreferencesService,
    {
      provide: EmailSender,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.emailDelivery.provider === 'preview'
          ? new PreviewEmailSender()
          : new HttpEmailSender(config),
    },
  ],
  exports: [EmailDeliveryRecords, NotificationPreferencesService, EmailSender],
})
export class EmailDeliveryModule {}
