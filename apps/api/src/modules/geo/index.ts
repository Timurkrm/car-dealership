export { GeoModule } from './geo.module';
export type { GeoPoint } from './domain/location.types';
export { ListingLocations, geoPoint } from './application/listing-locations';
export type { ListingLocation as LocationRecord } from './infrastructure/persistence/listing-location.entity';
export {
  SpatialSearchProjection,
  parseSpatialSearch,
  publicDistance,
  GEOGRAPHY_DISTANCE,
} from './application/spatial-search';
export type { SpatialSearch } from './application/spatial-search';
