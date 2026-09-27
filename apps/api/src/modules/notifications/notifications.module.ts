import { Module } from '@nestjs/common';
import { NotificationWriter } from './application/notification-writer';
import { NotificationCenter } from './application/notification-center';
import { NotificationsController } from './http/notifications.controller';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';
import { NotificationRealtime } from './application/notification-realtime';
import { EmailDeliveryModule } from '../email-delivery';

@Module({
  imports: [PlatformModule, AuthModule, EmailDeliveryModule],
  controllers: [NotificationsController],
  providers: [
    NotificationWriter,
    NotificationCenter,
    NotificationRealtime,
    RequestRateGuard,
  ],
  exports: [NotificationWriter, NotificationCenter, NotificationRealtime],
})
export class NotificationsModule {}
