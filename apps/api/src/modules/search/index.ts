export { SearchModule } from './search.module';
export { ListingSearch } from './application/listing-search';
export {
  SavedSearchMatcher,
  matchesSavedSearch,
} from './application/saved-search-matcher';
export type {
  SavedSearchCandidate,
  ListingMatchingSnapshot,
} from './application/saved-search-matcher';
export {
  parseSearchQuery,
  canonicalSearch,
  SEARCH_SCHEMA_VERSION,
  parseSavedSearchFilters,
  hasMeaningfulSavedSearchFilter,
} from './domain/search-query';
export type {
  SearchQuery,
  SearchFilters,
  CanonicalSavedSearch,
} from './domain/search-query';
export type {
  SearchListingType,
  VehicleListingSearchFilters,
  PartListingSearchFilters,
} from './domain/search-query';
export {
  parseMapQuery,
  mapGridCellMeters,
  MAP_FEATURE_LIMIT,
} from './domain/map-query';
export type { MapSearchQuery, MapViewport } from './domain/map-query';
