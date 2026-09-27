import { Module } from '@nestjs/common';
import type { DynamicModule, Type } from '@nestjs/common';
import { ListingMediaPort } from './application/listing-media.port';
import { ListingAccess } from './application/listing-access';
import { ListingSearchProjection } from './application/listing-search-projection';
import { ListingModerationRecords } from './application/listing-moderation-records';
import { FavoriteListingReader } from './application/favorite-listing-reader';
import { ListingMessagingReader } from './application/listing-messaging-reader';
import { ListingPublicationPolicy } from './application/listing-publication-policy';
import { PlatformModule } from '../../platform/platform.module';
import { DatabaseConnection } from '../../platform/database/database.connection';
import { ListingPersistence } from './infrastructure/persistence/listing.persistence';
import { VehiclesModule } from '../vehicles';
import { PartsModule } from '../parts';
import { GeoModule } from '../geo';
import { UsersModule } from '../users';
import { AuthModule } from '../auth';
import { AuditModule } from '../audit';
import { OutboxModule } from '../outbox';
import { ListingCommands } from './application/listing-commands';
import { ListingQueries } from './application/listing-queries';
import {
  PublicListingsController,
  SellerListingsController,
} from './http/listings.controller';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';
import {
  PartListingsController,
  SellerPartListingsController,
} from './http/part-listings.controller';

@Module({
  imports: [
    PlatformModule,
    VehiclesModule,
    PartsModule,
    GeoModule,
    UsersModule,
    AuthModule,
    AuditModule,
    OutboxModule,
  ],
  controllers: [
    PublicListingsController,
    SellerListingsController,
    PartListingsController,
    SellerPartListingsController,
  ],
  providers: [
    {
      provide: ListingPersistence,
      inject: [DatabaseConnection],
      useFactory: (database: DatabaseConnection) =>
        new ListingPersistence(database.source),
    },
    ListingCommands,
    ListingQueries,
    ListingAccess,
    ListingSearchProjection,
    ListingPublicationPolicy,
    ListingModerationRecords,
    FavoriteListingReader,
    ListingMessagingReader,
    RequestRateGuard,
  ],
  exports: [
    ListingPersistence,
    ListingAccess,
    ListingSearchProjection,
    ListingModerationRecords,
    FavoriteListingReader,
    ListingMessagingReader,
  ],
})
export class ListingsModule {
  static withMedia(
    module: Type<unknown>,
    adapter: Type<ListingMediaPort>,
  ): DynamicModule {
    return {
      module: ListingsModule,
      imports: [module],
      providers: [{ provide: ListingMediaPort, useExisting: adapter }],
    };
  }
}
