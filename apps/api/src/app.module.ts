import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ConfigurationModule } from './config/configuration.module';
import type { AppConfig } from './config/config';
import { PlatformModule } from './platform/platform.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';
import { VehiclesModule } from './modules/vehicles';
import { ListingsModule } from './modules/listings';
import {
  MediaModule,
  MediaReadModule,
  MediaReadService,
} from './modules/media';
import { GeoModule } from './modules/geo';
import { SearchModule } from './modules/search';
import { FavoritesModule } from './modules/favorites';
import { MessagingModule } from './modules/messaging';
import { NotificationsModule } from './modules/notifications';
import { ModerationModule } from './modules/moderation';
import { AdminModule } from './modules/admin';
import { AuditModule } from './modules/audit';
import { EngagementModule } from './engagement.module';
import { AccountModule } from './modules/account';
import { EmailDeliveryModule } from './modules/email-delivery';
import { MetricsModule } from './platform/observability/metrics.module';
const listings = ListingsModule.withMedia(MediaReadModule, MediaReadService);
const moderation = ModerationModule.register(listings);
const search = SearchModule.register(listings);
const favorites = FavoritesModule.register(listings);
const messaging = MessagingModule.register(listings);
const engagement = EngagementModule.register(search, favorites, messaging);

@Module({
  exports: [PlatformModule, MediaModule, EngagementModule, EmailDeliveryModule],
  imports: [
    PlatformModule,
    MetricsModule,
    EmailDeliveryModule,
    HealthModule,
    AuthModule,
    AccountModule,
    UsersModule,
    VehiclesModule,
    listings,
    MediaModule.register(listings),
    GeoModule,
    search,
    favorites,
    messaging,
    NotificationsModule,
    engagement,
    moderation,
    AdminModule.register(listings, moderation),
    AuditModule,
  ],
})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigurationModule.register(config)],
    };
  }
}
