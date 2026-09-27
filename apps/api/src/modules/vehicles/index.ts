export { VehiclesModule } from './vehicles.module';
export { VehicleCatalog } from './application/vehicle-catalog';
export type { Vehicle } from './infrastructure/persistence/vehicle.entity';
export * from './domain/vehicle.types';
export { VehicleInput, VehiclePatch } from './application/vehicle-input';
export {
  VehicleRecords,
  vehicleSpecification,
} from './application/vehicle-records';
export type { VehicleRecord } from './application/vehicle-records';
export {
  VehicleSearchProjection,
  VEHICLE_SEARCH_COLUMNS,
} from './application/vehicle-search-projection';
export type { VehicleSearchFilters } from './application/vehicle-search-projection';
