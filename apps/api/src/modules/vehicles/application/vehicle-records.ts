import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Vehicle } from '../infrastructure/persistence/vehicle.entity';
import { VehicleCatalog } from './vehicle-catalog';
import type { VehicleInput } from './vehicle-input';
import type { VehicleGeneration } from '../infrastructure/persistence/vehicle-generation.entity';

export type VehicleRecord = Vehicle & {
  generation: Pick<
    VehicleGeneration,
    'id' | 'name' | 'modelId' | 'startYear' | 'endYear'
  > | null;
};

@Injectable()
export class VehicleRecords {
  constructor(
    @Inject(VehicleCatalog) private readonly catalog: VehicleCatalog,
  ) {}
  async create(input: VehicleInput, manager: EntityManager): Promise<string> {
    await this.catalog.validate(
      input.modelId,
      input.generationId ?? null,
      manager,
    );
    const id = randomUUID();
    await manager.insert(Vehicle, { id, ...vehicleSpecification(input) });
    return id;
  }
  /** Explicit batch projection boundary: specifications/catalog only; VIN requires owner mode. */
  async readMany(
    ids: string[],
    manager: EntityManager,
    owner = false,
  ): Promise<VehicleRecord[]> {
    if (!ids.length) return [];
    const query = manager
      .getRepository(Vehicle)
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.model', 'model')
      .leftJoinAndSelect('model.make', 'make')
      .leftJoin(
        'VehicleGeneration',
        'generation',
        'generation.id = vehicle.generationId AND generation.modelId = vehicle.modelId',
      )
      .addSelect('generation.id', 'catalogGenerationId')
      .addSelect('generation.name', 'catalogGenerationName')
      .addSelect('generation.modelId', 'catalogGenerationModelId')
      .addSelect('generation.startYear', 'catalogGenerationStartYear')
      .addSelect('generation.endYear', 'catalogGenerationEndYear')
      .where({ id: In(ids) });
    if (owner) query.addSelect('vehicle.vin');
    const { entities, raw } = await query.getRawAndEntities<{
      vehicle_id: string;
      catalogGenerationId: string | null;
      catalogGenerationName: string;
      catalogGenerationModelId: string;
      catalogGenerationStartYear: number;
      catalogGenerationEndYear: number | null;
    }>();
    const generations = new Map(
      raw.map((row) => [
        row.vehicle_id,
        row.catalogGenerationId
          ? {
              id: row.catalogGenerationId,
              name: row.catalogGenerationName,
              modelId: row.catalogGenerationModelId,
              startYear: row.catalogGenerationStartYear,
              endYear: row.catalogGenerationEndYear,
            }
          : null,
      ]),
    );
    return entities.map((vehicle) => ({
      ...vehicle,
      generation: generations.get(vehicle.id) ?? null,
    }));
  }
}

export function vehicleSpecification(
  input: VehicleInput,
): Required<VehicleInput> {
  return {
    modelId: input.modelId,
    generationId: input.generationId ?? null,
    year: input.year,
    mileageKm: input.mileageKm,
    bodyType: input.bodyType,
    fuelType: input.fuelType,
    transmission: input.transmission,
    driveType: input.driveType,
    condition: input.condition,
    enginePowerHp: input.enginePowerHp ?? null,
    engineDisplacementCc: input.engineDisplacementCc ?? null,
    color: input.color ?? null,
    vin: input.vin ?? null,
  };
}
