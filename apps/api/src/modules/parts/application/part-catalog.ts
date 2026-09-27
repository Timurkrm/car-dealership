import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { pageOf } from '../../../platform/http/page.dto';
import type { PageQuery } from '../../../platform/http/page.dto';
import { PartCategory } from '../infrastructure/persistence/part-category.entity';
import { PartBrand } from '../infrastructure/persistence/part-brand.entity';
import { invalidPart, validateCategoryParent } from '../domain/part.types';

@Injectable()
export class PartCatalog {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
  ) {}
  async categories(query: PageQuery) {
    const rows = await this.database.source.manager.find(PartCategory, {
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
      take: query.limit + 1,
      skip: query.offset,
    });
    return pageOf(
      rows.map(({ id, parentId, name, slug, sortOrder }) => ({
        id,
        parentId,
        name,
        slug,
        sortOrder,
      })),
      query,
    );
  }
  async brands(query: PageQuery) {
    const rows = await this.database.source.manager.find(PartBrand, {
      where: { isActive: true },
      order: { name: 'ASC', id: 'ASC' },
      take: query.limit + 1,
      skip: query.offset,
    });
    return pageOf(
      rows.map(({ id, name, slug }) => ({ id, name, slug })),
      query,
    );
  }
  async validate(
    categoryId: string,
    brandId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !(await manager.existsBy(PartCategory, {
        id: categoryId,
        isActive: true,
      }))
    )
      return invalidPart('PART_CATEGORY_NOT_FOUND');
    if (
      brandId &&
      !(await manager.existsBy(PartBrand, { id: brandId, isActive: true }))
    )
      return invalidPart('PART_BRAND_NOT_FOUND');
  }
  async activeAncestorIds(
    categoryId: string,
    manager: EntityManager,
  ): Promise<string[]> {
    const rows: { id: string }[] = await manager.query(
      `WITH RECURSIVE ancestors(id, parent_id, path, depth) AS (
         SELECT id, parent_id, ARRAY[id], 0
         FROM part_categories
         WHERE id = $1 AND is_active = true
         UNION ALL
         SELECT parent.id, parent.parent_id, ancestors.path || parent.id, ancestors.depth + 1
         FROM part_categories parent
         JOIN ancestors ON parent.id = ancestors.parent_id
         WHERE parent.is_active = true
           AND ancestors.depth < 31
           AND NOT parent.id = ANY(ancestors.path)
       )
       SELECT id FROM ancestors`,
      [categoryId],
    );
    return rows.map((row) => row.id);
  }
  /** Internal managed-catalog operation. Caller must supply its authorized transaction. */
  async setParent(
    id: string,
    parentId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Catalog transaction required');
    // Serialize hierarchy changes so two concurrent edits cannot introduce a cycle.
    await manager.query('SELECT pg_advisory_xact_lock(178999, 1)');
    const rows = await manager.find(PartCategory, {
      select: { id: true, parentId: true },
    });
    const parents = new Map(rows.map((row) => [row.id, row.parentId]));
    if (!parents.has(id)) return invalidPart('PART_CATEGORY_NOT_FOUND');
    validateCategoryParent(id, parentId, parents);
    await manager.update(PartCategory, { id }, { parentId });
  }
}
