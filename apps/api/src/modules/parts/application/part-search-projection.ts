import { Inject, Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { VehicleCatalog } from '../../vehicles';
import type { FitmentMode, PartCondition } from '../domain/part.types';
import { Part } from '../infrastructure/persistence/part.entity';
import { PartFitment } from '../infrastructure/persistence/part-fitment.entity';
import { PartCategory } from '../infrastructure/persistence/part-category.entity';
import { PartBrand } from '../infrastructure/persistence/part-brand.entity';

export const PART_SEARCH_COLUMNS = {
  category: '"partCategory"."id"',
  brand: '"partBrand"."id"',
  condition: '"part"."condition"',
} as const;
export interface PartSearchFilters {
  categoryId?: string;
  includeSubcategories: boolean;
  brandId?: string;
  condition?: PartCondition[];
  oemNumber?: string;
  manufacturerPartNumber?: string;
  partNumber?: string;
  compatibleMakeId?: string;
  compatibleModelId?: string;
  compatibleGenerationId?: string;
  compatibleYear?: number;
  fitmentMode?: FitmentMode[];
  includeUniversal: boolean;
}

/**
 * Parts owns its search joins and fitment semantics. Search supplies the
 * common listing/location/media query and never reaches into Parts tables.
 */
@Injectable()
export class PartSearchProjection {
  constructor(
    @Inject(VehicleCatalog) private readonly vehicles: VehicleCatalog,
  ) {}

  attach<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    filters: PartSearchFilters,
  ): void {
    query
      .innerJoin(Part, 'part', 'part.id = partOffer.partId')
      .innerJoin(
        PartCategory,
        'partCategory',
        'partCategory.id = part.categoryId AND partCategory.isActive = true',
      )
      .leftJoin(
        PartBrand,
        'partBrand',
        'partBrand.id = part.brandId AND partBrand.isActive = true',
      )
      .andWhere('(part.brandId IS NULL OR partBrand.id IS NOT NULL)')
      .andWhere('length(btrim(part.name)) > 0')
      .andWhere(
        "(part.fitmentMode = 'UNIVERSAL' OR EXISTS (SELECT 1 FROM part_fitments publication_fitment WHERE publication_fitment.part_id = part.id))",
      )
      .addSelect('part.id', 'partId')
      .addSelect('part.name', 'partName')
      .addSelect('partCategory.id', 'partCategoryId')
      .addSelect('partCategory.name', 'partCategoryName')
      .addSelect('partCategory.parentId', 'partCategoryParentId')
      .addSelect('partBrand.id', 'partBrandId')
      .addSelect('partBrand.name', 'partBrandName')
      .addSelect('part.condition', 'partCondition')
      .addSelect('part.manufacturerPartNumber', 'manufacturerPartNumber')
      .addSelect('part.oemNumber', 'oemNumber')
      .addSelect('part.fitmentMode', 'fitmentMode')
      .addSelect('partOffer.quantityAvailable', 'quantityAvailable')
      .addSelect(
        '(SELECT COUNT(*)::integer FROM part_fitments count_fitment WHERE count_fitment.part_id = part.id)',
        'fitmentCount',
      );

    if (filters.categoryId) {
      if (filters.includeSubcategories) {
        query.andWhere(
          `"part"."category_id" IN (
            WITH RECURSIVE category_tree(id, path, depth) AS (
              SELECT category_root.id, ARRAY[category_root.id], 0
              FROM part_categories category_root
              WHERE category_root.id = :categoryId AND category_root.is_active = true
              UNION ALL
              SELECT category_child.id, category_tree.path || category_child.id, category_tree.depth + 1
              FROM part_categories category_child
              JOIN category_tree ON category_child.parent_id = category_tree.id
              WHERE category_child.is_active = true
                AND category_tree.depth < 31
                AND NOT category_child.id = ANY(category_tree.path)
            )
            SELECT id FROM category_tree
          )`,
          { categoryId: filters.categoryId },
        );
      } else {
        query.andWhere('part.categoryId = :categoryId', {
          categoryId: filters.categoryId,
        });
      }
    }
    if (filters.brandId)
      query.andWhere('part.brandId = :partBrandId', {
        partBrandId: filters.brandId,
      });
    if (filters.condition?.length)
      query.andWhere('part.condition IN (:...partConditions)', {
        partConditions: filters.condition,
      });
    if (filters.fitmentMode?.length)
      query.andWhere('part.fitmentMode IN (:...fitmentModes)', {
        fitmentModes: filters.fitmentMode,
      });
    if (filters.oemNumber)
      query.andWhere('part.oemNumber = :oemNumber', {
        oemNumber: filters.oemNumber,
      });
    if (filters.manufacturerPartNumber)
      query.andWhere('part.manufacturerPartNumber = :manufacturerPartNumber', {
        manufacturerPartNumber: filters.manufacturerPartNumber,
      });
    if (filters.partNumber)
      query.andWhere(
        '(part.oemNumber = :partNumber OR part.manufacturerPartNumber = :partNumber)',
        { partNumber: filters.partNumber },
      );

    if (
      filters.compatibleMakeId ||
      filters.compatibleModelId ||
      filters.compatibleGenerationId ||
      filters.compatibleYear !== undefined
    )
      this.attachCompatibility(query, filters);
  }

  private attachCompatibility<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    filters: PartSearchFilters,
  ): void {
    const fitments = query.connection
      .getRepository(PartFitment)
      .createQueryBuilder('fitment')
      .select('fitment.partId');
    this.vehicles.filterFitmentModel(
      fitments,
      filters.compatibleMakeId,
      filters.compatibleModelId,
    );
    if (filters.compatibleGenerationId)
      fitments.andWhere(
        '(fitment.generationId IS NULL OR fitment.generationId = :compatibleGenerationId)',
        { compatibleGenerationId: filters.compatibleGenerationId },
      );
    if (filters.compatibleYear !== undefined)
      fitments
        .andWhere(
          '(fitment.yearFrom IS NULL OR fitment.yearFrom <= :compatibleYear)',
          { compatibleYear: filters.compatibleYear },
        )
        .andWhere(
          '(fitment.yearTo IS NULL OR fitment.yearTo >= :compatibleYear)',
          { compatibleYear: filters.compatibleYear },
        );
    const specific =
      "part.fitmentMode = 'VEHICLE_SPECIFIC' AND part.id IN (" +
      fitments.getQuery() +
      ')';
    query.andWhere(
      filters.includeUniversal
        ? `(part.fitmentMode = 'UNIVERSAL' OR (${specific}))`
        : `(${specific})`,
      fitments.getParameters(),
    );
  }
}
