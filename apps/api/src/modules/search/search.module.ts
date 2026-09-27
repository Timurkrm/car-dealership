import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { VehiclesModule } from '../vehicles';
import { PartsModule } from '../parts';
import { GeoModule } from '../geo';
import { MediaReadModule } from '../media';
import { SearchController } from './http/search.controller';
import { ListingSearch } from './application/listing-search';
import { ListingSearchQuery } from './infrastructure/listing-search-query';
import { SearchCursor } from './domain/search-cursor';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';
import { AuthModule } from '../auth';
import { SavedSearchController } from './http/saved-search.controller';
import { SavedSearches } from './application/saved-searches';
import { SavedSearchMatcher } from './application/saved-search-matcher';
import {
  PartSearchStrategy,
  SearchSubtypeStrategies,
  VehicleSearchStrategy,
} from './infrastructure/search-subtype-strategy';

@Module({
  imports: [
    PlatformModule,
    VehiclesModule,
    PartsModule,
    GeoModule,
    MediaReadModule,
    AuthModule,
  ],
  controllers: [SearchController, SavedSearchController],
  providers: [
    ListingSearch,
    ListingSearchQuery,
    VehicleSearchStrategy,
    PartSearchStrategy,
    SearchSubtypeStrategies,
    SearchCursor,
    RequestRateGuard,
    SavedSearches,
    SavedSearchMatcher,
  ],
  exports: [ListingSearch, SavedSearches, SavedSearchMatcher],
})
export class SearchModule {
  static register(listings: DynamicModule): DynamicModule {
    return { module: SearchModule, imports: [listings] };
  }
}
