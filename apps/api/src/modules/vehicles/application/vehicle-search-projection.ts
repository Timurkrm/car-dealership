import { Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Vehicle } from '../infrastructure/persistence/vehicle.entity';
import { VehicleMake } from '../infrastructure/persistence/vehicle-make.entity';
import { VehicleModel } from '../infrastructure/persistence/vehicle-model.entity';
import { VehicleGeneration } from '../infrastructure/persistence/vehicle-generation.entity';

export const VEHICLE_SEARCH_COLUMNS = {
  mileage: '"vehicle"."mileage_km"',
  year: '"vehicle"."year"',
  make: '"make"."id"',
  bodyType: '"vehicle"."body_type"',
  fuelType: '"vehicle"."fuel_type"',
  transmission: '"vehicle"."transmission"',
} as const;
export interface VehicleSearchFilters {
  makeId?: string;
  modelId?: string;
  generationId?: string;
  yearFrom?: number;
  yearTo?: number;
  mileageFrom?: number;
  mileageTo?: number;
  bodyType?: readonly string[];
  fuelType?: readonly string[];
  transmission?: readonly string[];
  driveType?: readonly string[];
  condition?: readonly string[];
  color?: readonly string[];
}
/** Catalog relations are bound into the projection: inconsistent/unknown IDs consistently match zero rows. */
@Injectable()
export class VehicleSearchProjection {
  attach<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    filters: VehicleSearchFilters,
  ): void {
    query
      .innerJoin(Vehicle, 'vehicle', 'vehicle.id = vehicleOffer.vehicleId')
      .innerJoin(VehicleModel, 'model', 'model.id = vehicle.modelId')
      .innerJoin(VehicleMake, 'make', 'make.id = model.makeId')
      .leftJoin(
        VehicleGeneration,
        'generation',
        'generation.id = vehicle.generationId AND generation.modelId = model.id',
      )
      .andWhere('(vehicle.generationId IS NULL OR generation.id IS NOT NULL)');
    for (const [column, alias] of [
      ['make.id', 'makeId'],
      ['make.name', 'makeName'],
      ['model.id', 'modelId'],
      ['model.name', 'modelName'],
      ['generation.id', 'generationId'],
      ['generation.name', 'generationName'],
      ['vehicle.year', 'year'],
      ['vehicle.mileageKm', 'mileageKm'],
      ['vehicle.bodyType', 'bodyType'],
      ['vehicle.fuelType', 'fuelType'],
      ['vehicle.transmission', 'transmission'],
      ['vehicle.driveType', 'driveType'],
      ['vehicle.condition', 'condition'],
      ['vehicle.color', 'color'],
    ])
      if (column && alias) query.addSelect(column, alias);
    for (const [key, column] of [
      ['makeId', 'make.id'],
      ['modelId', 'model.id'],
      ['generationId', 'generation.id'],
    ] as const)
      if (filters[key])
        query.andWhere(`${column} = :${key}`, { [key]: filters[key] });
    for (const [key, column, operation] of [
      ['yearFrom', 'vehicle.year', '>='],
      ['yearTo', 'vehicle.year', '<='],
      ['mileageFrom', 'vehicle.mileageKm', '>='],
      ['mileageTo', 'vehicle.mileageKm', '<='],
    ] as const)
      if (filters[key] !== undefined)
        query.andWhere(`${column} ${operation} :${key}`, {
          [key]: filters[key],
        });
    for (const key of [
      'bodyType',
      'fuelType',
      'transmission',
      'driveType',
      'condition',
      'color',
    ] as const)
      if (filters[key]?.length)
        query.andWhere(`vehicle.${key} IN (:...${key})`, {
          [key]: filters[key],
        });
  }
}
