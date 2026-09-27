import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { VehicleCatalog } from '../../vehicles';
import { PartCatalog } from './part-catalog';
import type { PartInput, PartPatch } from './part-input';
import { Part } from '../infrastructure/persistence/part.entity';
import { PartFitment } from '../infrastructure/persistence/part-fitment.entity';
import { PartCategory } from '../infrastructure/persistence/part-category.entity';
import { PartBrand } from '../infrastructure/persistence/part-brand.entity';
import {
  invalidPart,
  normalizePartNumber,
  validateFitment,
} from '../domain/part.types';
import type { FitmentSelection } from '../domain/part.types';

export interface FitmentRecord extends FitmentSelection {
  make: { id: string; name: string };
  model: { id: string; name: string };
  generation: { id: string; name: string } | null;
}
export interface PartRecord extends Part {
  category: {
    id: string;
    name: string;
    parentId: string | null;
    isActive: boolean;
  };
  brand: { id: string; name: string; isActive: boolean } | null;
  fitments: FitmentRecord[];
  fitmentCount: number;
}
@Injectable()
export class PartRecords {
  constructor(
    @Inject(PartCatalog) private readonly catalog: PartCatalog,
    @Inject(VehicleCatalog) private readonly vehicles: VehicleCatalog,
  ) {}
  async create(input: PartInput, manager: EntityManager): Promise<string> {
    await this.validate(input, manager);
    const id = randomUUID();
    await manager.insert(Part, {
      id,
      categoryId: input.categoryId,
      brandId: input.brandId ?? null,
      name: input.name,
      condition: input.condition,
      manufacturerPartNumber: normalizePartNumber(input.manufacturerPartNumber),
      oemNumber: normalizePartNumber(input.oemNumber),
      fitmentMode: input.fitment.mode,
    });
    await this.replaceFitments(id, input.fitment.vehicles, manager);
    return id;
  }
  async update(
    id: string,
    patch: PartPatch,
    manager: EntityManager,
  ): Promise<void> {
    const current = await manager.findOneByOrFail(Part, { id });
    const rows = await manager.find(PartFitment, { where: { partId: id } });
    const input: PartInput = {
      categoryId: patch.categoryId ?? current.categoryId,
      brandId: patch.brandId === undefined ? current.brandId : patch.brandId,
      name: patch.name ?? current.name,
      condition: patch.condition ?? current.condition,
      manufacturerPartNumber:
        patch.manufacturerPartNumber === undefined
          ? current.manufacturerPartNumber
          : patch.manufacturerPartNumber,
      oemNumber:
        patch.oemNumber === undefined ? current.oemNumber : patch.oemNumber,
      fitment: patch.fitment ?? { mode: current.fitmentMode, vehicles: rows },
    };
    await this.validate(input, manager);
    await manager.update(
      Part,
      { id },
      {
        categoryId: input.categoryId,
        brandId: input.brandId ?? null,
        name: input.name,
        condition: input.condition,
        manufacturerPartNumber: normalizePartNumber(
          input.manufacturerPartNumber,
        ),
        oemNumber: normalizePartNumber(input.oemNumber),
        fitmentMode: input.fitment.mode,
      },
    );
    if (patch.fitment)
      await this.replaceFitments(id, input.fitment.vehicles, manager);
  }
  async assertReady(id: string, manager: EntityManager): Promise<void> {
    const rows = await this.readMany([id], manager, true);
    const part = rows[0];
    if (
      !part ||
      !part.category.isActive ||
      (part.brand && !part.brand.isActive) ||
      !part.name.trim() ||
      (part.fitmentMode === 'VEHICLE_SPECIFIC' && !part.fitments.length)
    )
      return invalidPart('PART_INCOMPLETE');
    await this.validate(
      {
        categoryId: part.categoryId,
        brandId: part.brandId,
        name: part.name,
        condition: part.condition,
        manufacturerPartNumber: part.manufacturerPartNumber,
        oemNumber: part.oemNumber,
        fitment: { mode: part.fitmentMode, vehicles: part.fitments },
      },
      manager,
    );
  }
  private async validate(
    input: PartInput,
    manager: EntityManager,
  ): Promise<void> {
    validateFitment(input.fitment);
    normalizePartNumber(input.manufacturerPartNumber);
    normalizePartNumber(input.oemNumber);
    await this.catalog.validate(
      input.categoryId,
      input.brandId ?? null,
      manager,
    );
    for (const row of input.fitment.vehicles)
      await this.vehicles.validate(
        row.modelId,
        row.generationId ?? null,
        manager,
      );
  }
  private async replaceFitments(
    id: string,
    rows: FitmentSelection[],
    manager: EntityManager,
  ): Promise<void> {
    await manager.delete(PartFitment, { partId: id });
    if (rows.length)
      await manager.insert(
        PartFitment,
        rows.map((row) => ({
          id: randomUUID(),
          partId: id,
          modelId: row.modelId,
          generationId: row.generationId ?? null,
          yearFrom: row.yearFrom ?? null,
          yearTo: row.yearTo ?? null,
        })),
      );
  }
  async readMany(
    ids: string[],
    manager: EntityManager,
    detail = true,
  ): Promise<PartRecord[]> {
    if (!ids.length) return [];
    const { entities: rows, raw } = await manager
      .getRepository(Part)
      .createQueryBuilder('part')
      .innerJoin(PartCategory, 'category', 'category.id = part.categoryId')
      .leftJoin(PartBrand, 'brand', 'brand.id = part.brandId')
      .addSelect('category.id', 'catalogCategoryId')
      .addSelect('category.name', 'catalogCategoryName')
      .addSelect('category.parentId', 'catalogCategoryParentId')
      .addSelect('category.isActive', 'catalogCategoryActive')
      .addSelect('brand.id', 'catalogBrandId')
      .addSelect('brand.name', 'catalogBrandName')
      .addSelect('brand.isActive', 'catalogBrandActive')
      .where({ id: In(ids) })
      .getRawAndEntities<{
        part_id: string;
        catalogCategoryId: string;
        catalogCategoryName: string;
        catalogCategoryParentId: string | null;
        catalogCategoryActive: boolean;
        catalogBrandId: string | null;
        catalogBrandName: string;
        catalogBrandActive: boolean;
      }>();
    const references = new Map(raw.map((row) => [row.part_id, row]));
    const fitments = detail
      ? await manager.find(PartFitment, {
          where: { partId: In(ids) },
          order: {
            modelId: 'ASC',
            generationId: 'ASC',
            yearFrom: 'ASC',
            id: 'ASC',
          },
        })
      : [];
    const counts = detail
      ? []
      : await manager
          .getRepository(PartFitment)
          .createQueryBuilder('fitment')
          .select('fitment.partId', 'partId')
          .addSelect('COUNT(*)::integer', 'count')
          .where('fitment.partId IN (:...ids)', { ids })
          .groupBy('fitment.partId')
          .getRawMany<{ partId: string; count: number }>();
    const refs = await this.vehicles.fitmentReferences(
      [...new Set(fitments.map((row) => row.modelId))],
      [
        ...new Set(
          fitments.flatMap((row) =>
            row.generationId ? [row.generationId] : [],
          ),
        ),
      ],
      manager,
    );
    const countById = new Map(counts.map((row) => [row.partId, row.count]));
    return rows.map((part) => {
      const reference = references.get(part.id);
      if (!reference) throw new Error('Missing part reference projection');
      const owned = fitments.filter((row) => row.partId === part.id);
      return {
        ...part,
        category: {
          id: reference.catalogCategoryId,
          name: reference.catalogCategoryName,
          parentId: reference.catalogCategoryParentId,
          isActive: reference.catalogCategoryActive,
        },
        brand: reference.catalogBrandId
          ? {
              id: reference.catalogBrandId,
              name: reference.catalogBrandName,
              isActive: reference.catalogBrandActive,
            }
          : null,
        fitmentCount: detail ? owned.length : (countById.get(part.id) ?? 0),
        fitments: owned.map((row) => {
          const model = refs.models.get(row.modelId);
          if (!model) throw new Error('Missing fitment catalog');
          const generation = row.generationId
            ? refs.generations.get(row.generationId)
            : undefined;
          return {
            modelId: row.modelId,
            generationId: row.generationId,
            yearFrom: row.yearFrom,
            yearTo: row.yearTo,
            make: model.make,
            model: { id: model.id, name: model.name },
            generation: generation
              ? { id: generation.id, name: generation.name }
              : null,
          };
        }),
      };
    });
  }
}
