import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import { pageOf } from '../../../platform/http/page.dto';
import type { PageQuery } from '../../../platform/http/page.dto';
import { VehicleMake } from '../infrastructure/persistence/vehicle-make.entity';
import { VehicleModel } from '../infrastructure/persistence/vehicle-model.entity';
import { VehicleGeneration } from '../infrastructure/persistence/vehicle-generation.entity';

@Injectable()
export class VehicleCatalog {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
  ) {}
  async fitmentReferences(
    modelIds: string[],
    generationIds: string[],
    manager: EntityManager,
  ) {
    // Keep the projection query count stable for bounded search pages,
    // including pages that contain only universal fitments.
    const models = await manager
      .getRepository(VehicleModel)
      .createQueryBuilder('model')
      .innerJoinAndSelect('model.make', 'make')
      .where({ id: In(modelIds) })
      .getMany();
    const generations = await manager.findBy(VehicleGeneration, {
      id: In(generationIds),
    });
    return {
      models: new Map(
        models.map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            make: { id: row.make.id, name: row.make.name },
          },
        ]),
      ),
      generations: new Map(
        generations.map((row) => [
          row.id,
          { id: row.id, name: row.name, modelId: row.modelId },
        ]),
      ),
    };
  }
  filterFitmentModel<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    makeId?: string,
    modelId?: string,
  ): void {
    query.innerJoin(
      VehicleModel,
      'compatibleModel',
      'compatibleModel.id = fitment.modelId',
    );
    if (makeId)
      query.andWhere('compatibleModel.makeId = :compatibleMakeId', {
        compatibleMakeId: makeId,
      });
    if (modelId)
      query.andWhere('compatibleModel.id = :compatibleModelId', {
        compatibleModelId: modelId,
      });
  }
  async makes(query: PageQuery) {
    const rows = await this.database.source.getRepository(VehicleMake).find({
      select: { id: true, name: true, slug: true },
      order: { name: 'ASC', id: 'ASC' },
      take: query.limit + 1,
      skip: query.offset,
    });
    return pageOf(
      rows.map(({ id, name, slug }) => ({ id, name, slug })),
      query,
    );
  }
  async models(makeId: string, query: PageQuery) {
    const manager = this.database.source.manager;
    if (!(await manager.existsBy(VehicleMake, { id: makeId })))
      throw new ApiException(
        404,
        'VEHICLE_MAKE_NOT_FOUND',
        'Vehicle make not found',
      );
    const rows = await manager.find(VehicleModel, {
      where: { makeId },
      order: { name: 'ASC', id: 'ASC' },
      take: query.limit + 1,
      skip: query.offset,
    });
    return pageOf(
      rows.map(({ id, name, slug, makeId: parent }) => ({
        id,
        name,
        slug,
        makeId: parent,
      })),
      query,
    );
  }
  async generations(modelId: string, query: PageQuery) {
    const manager = this.database.source.manager;
    await this.validate(modelId, null, manager);
    const rows = await manager.find(VehicleGeneration, {
      where: { modelId },
      order: { name: 'ASC', id: 'ASC' },
      take: query.limit + 1,
      skip: query.offset,
    });
    return pageOf(
      rows.map(({ id, name, modelId: parent, startYear, endYear }) => ({
        id,
        name,
        modelId: parent,
        startYear,
        endYear,
      })),
      query,
    );
  }
  async validate(
    modelId: string,
    generationId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    if (!(await manager.existsBy(VehicleModel, { id: modelId })))
      throw new ApiException(
        400,
        'VEHICLE_MODEL_NOT_FOUND',
        'Vehicle model not found',
      );
    if (!generationId) return;
    const generation = await manager.findOneBy(VehicleGeneration, {
      id: generationId,
    });
    if (!generation)
      throw new ApiException(
        400,
        'VEHICLE_GENERATION_NOT_FOUND',
        'Vehicle generation not found',
      );
    if (generation.modelId !== modelId)
      throw new ApiException(
        400,
        'VEHICLE_GENERATION_MODEL_MISMATCH',
        'Generation does not belong to model',
      );
  }
}
