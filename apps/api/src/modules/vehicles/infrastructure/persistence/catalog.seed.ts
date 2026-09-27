import type { EntityManager } from 'typeorm';

const catalog = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'BMW',
    slug: 'bmw',
    models: [
      {
        id: '20000000-0000-4000-8000-000000000001',
        name: '3 Series',
        slug: '3-series',
        generation: {
          id: '30000000-0000-4000-8000-000000000001',
          name: 'G20',
          startYear: 2018,
        },
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        name: '5 Series',
        slug: '5-series',
        generation: {
          id: '30000000-0000-4000-8000-000000000002',
          name: 'G60',
          startYear: 2023,
        },
      },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Mercedes-Benz',
    slug: 'mercedes-benz',
    models: [
      {
        id: '20000000-0000-4000-8000-000000000003',
        name: 'C-Class',
        slug: 'c-class',
        generation: {
          id: '30000000-0000-4000-8000-000000000003',
          name: 'W206',
          startYear: 2021,
        },
      },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    name: 'Audi',
    slug: 'audi',
    models: [
      {
        id: '20000000-0000-4000-8000-000000000004',
        name: 'A4',
        slug: 'a4',
        generation: {
          id: '30000000-0000-4000-8000-000000000004',
          name: 'B9',
          startYear: 2015,
        },
      },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    name: 'Volkswagen',
    slug: 'volkswagen',
    models: [
      {
        id: '20000000-0000-4000-8000-000000000005',
        name: 'Golf',
        slug: 'golf',
        generation: {
          id: '30000000-0000-4000-8000-000000000005',
          name: 'VIII',
          startYear: 2019,
        },
      },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    name: 'Toyota',
    slug: 'toyota',
    models: [
      {
        id: '20000000-0000-4000-8000-000000000006',
        name: 'Corolla',
        slug: 'corolla',
        generation: {
          id: '30000000-0000-4000-8000-000000000006',
          name: 'E210',
          startYear: 2018,
        },
      },
    ],
  },
] as const;

/** Development/test catalog only. Preserve existing records and their UUIDs. */
export async function seedVehicleCatalog(
  manager: EntityManager,
): Promise<void> {
  for (const make of catalog) {
    await manager.query(
      'INSERT INTO vehicle_makes(id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING',
      [make.id, make.name, make.slug],
    );
    const makes: { id: string }[] = await manager.query(
      'SELECT id FROM vehicle_makes WHERE slug = $1',
      [make.slug],
    );
    const makeId = makes[0]?.id;
    if (!makeId) throw new Error('Seed make unavailable');
    for (const model of make.models) {
      await manager.query(
        'INSERT INTO vehicle_models(id, make_id, name, slug) VALUES ($1, $2, $3, $4) ON CONFLICT (make_id, slug) DO NOTHING',
        [model.id, makeId, model.name, model.slug],
      );
      const models: { id: string }[] = await manager.query(
        'SELECT id FROM vehicle_models WHERE make_id = $1 AND slug = $2',
        [makeId, model.slug],
      );
      const modelId = models[0]?.id;
      if (!modelId) throw new Error('Seed model unavailable');
      await manager.query(
        'INSERT INTO vehicle_generations(id, model_id, name, start_year) VALUES ($1, $2, $3, $4) ON CONFLICT (model_id, name) DO NOTHING',
        [
          model.generation.id,
          modelId,
          model.generation.name,
          model.generation.startYear,
        ],
      );
    }
  }
}
