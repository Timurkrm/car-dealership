import { Module } from '@nestjs/common';
import { ListingLocations } from './application/listing-locations';
import { SpatialSearchProjection } from './application/spatial-search';

@Module({
  providers: [ListingLocations, SpatialSearchProjection],
  exports: [ListingLocations, SpatialSearchProjection],
})
export class GeoModule {}
