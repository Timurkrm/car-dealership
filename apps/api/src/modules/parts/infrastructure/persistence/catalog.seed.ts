import type { EntityManager } from 'typeorm';
import { PartCategory } from './part-category.entity';
import { PartBrand } from './part-brand.entity';
import { validateCategoryParent } from '../../domain/part.types';

export const PART_CATEGORY_IDS = {
  brakes: 'a1000000-0000-4000-8000-000000000002',
  pads: 'a1000000-0000-4000-8000-000000000012',
} as const;
export const PART_BRAND_IDS = {
  bosch: 'a2000000-0000-4000-8000-000000000001',
} as const;
/** Small development reference fixture; never production master data or a migration seed. */
export async function seedPartCatalog(manager: EntityManager): Promise<void> {
  const names = [
    ['Engine', 'engine'],
    ['Brakes', 'brakes'],
    ['Suspension', 'suspension'],
    ['Transmission', 'transmission'],
    ['Body', 'body'],
    ['Electronics', 'electronics'],
    ['Interior', 'interior'],
    ['Wheels & Tires', 'wheels-tires'],
    ['Lighting', 'lighting'],
    ['Exhaust', 'exhaust'],
    ['Other', 'other'],
    ['Brake pads', 'brake-pads'],
    ['Brake discs', 'brake-discs'],
  ] as const;
  const parents = new Map<string, string | null>();
  for (const [index] of names.entries()) {
    const id = 'a1000000-0000-4000-8000-' + String(index + 1).padStart(12, '0');
    parents.set(id, index >= 11 ? PART_CATEGORY_IDS.brakes : null);
  }
  for (const [id, parentId] of parents)
    validateCategoryParent(id, parentId, parents);
  for (const [index, [name, slug]] of names.entries()) {
    const id = 'a1000000-0000-4000-8000-' + String(index + 1).padStart(12, '0');
    const parentId =
      index >= 11
        ? (await manager.findOneByOrFail(PartCategory, { slug: 'brakes' })).id
        : null;
    await manager
      .getRepository(PartCategory)
      .createQueryBuilder()
      .insert()
      .values({ id, parentId, name, slug, sortOrder: index })
      .orIgnore()
      .execute();
  }
  for (const [index, [name, slug]] of [
    ['Bosch', 'bosch'],
    ['Brembo', 'brembo'],
    ['MANN-FILTER', 'mann-filter'],
    ['Continental', 'continental'],
    ['Valeo', 'valeo'],
    ['Sachs', 'sachs'],
  ].entries()) {
    await manager
      .getRepository(PartBrand)
      .createQueryBuilder()
      .insert()
      .values({
        id: 'a2000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
        name,
        slug,
      })
      .orIgnore()
      .execute();
  }
}
