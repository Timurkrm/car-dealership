export { PartsModule } from './parts.module';
export { PartRecords } from './application/part-records';
export type { PartRecord, FitmentRecord } from './application/part-records';
export { PartCatalog } from './application/part-catalog';
export {
  PartSearchProjection,
  PART_SEARCH_COLUMNS,
} from './application/part-search-projection';
export type { PartSearchFilters } from './application/part-search-projection';
export {
  PartInput,
  PartPatch,
  PartFitmentInput,
  FitmentVehicleInput,
} from './application/part-input';
export * from './domain/part.types';
export type { Part } from './infrastructure/persistence/part.entity';
