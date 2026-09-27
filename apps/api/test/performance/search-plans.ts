import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { loadConfig, workspaceRoot } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { ListingSearchQuery } from '../../src/modules/search/infrastructure/listing-search-query';
import { parseMapQuery, parseSearchQuery } from '../../src/modules/search';
import { createSchemaDatabase } from '../support/schema-database';
import { seedMarketplaceFixture } from '../support/marketplace-fixture';
import {
  seedPartCatalog,
  PART_CATEGORY_IDS,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Order By'?: string | string[];
  'Sort Key'?: string[];
  Plans?: PlanNode[];
}
function nodes(plan: PlanNode): PlanNode[] {
  return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

/** Deliberately an owned test-only DB; never seed the configured development/test DB. */
async function main() {
  const database = await createSchemaDatabase();
  const { source } = database;
  let module:
    | Awaited<
        ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
      >
    | undefined;
  try {
    await source.runMigrations();
    await seedMarketplaceFixture(source);
    await source.transaction(seedPartCatalog);
    const vehicleCount = 30000;
    const partCount = 25000;
    for (let start = 1; start <= vehicleCount; start += 2000) {
      const parameters = [start, Math.min(vehicleCount, start + 1999)];
      await source.query(
        `INSERT INTO vehicles(id,model_id,generation_id,year,mileage_km,body_type,fuel_type,transmission,drive_type,condition,color)
        SELECT md5('plan-vehicle-'||i)::uuid,('20000000-0000-4000-8000-'||lpad((1+(i%6))::text,12,'0'))::uuid,
        ('30000000-0000-4000-8000-'||lpad((1+(i%6))::text,12,'0'))::uuid,
        2000+i%26,i%250000,(ARRAY['SEDAN','SUV','WAGON'])[1+i%3],(ARRAY['PETROL','DIESEL','ELECTRIC'])[1+i%3],
        (ARRAY['MANUAL','AUTOMATIC'])[1+i%2],'FWD','USED',(ARRAY['BLACK','WHITE','BLUE'])[1+i%3]
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO listings(id,seller_id,title,description,price_minor,currency,status,published_at,sold_at)
        SELECT md5('plan-listing-'||i)::uuid,'40000000-0000-4000-8000-000000000001',
        'Deterministic vehicle '||i,'Synthetic performance fixture',100000+i*131,(ARRAY['EUR','USD'])[1+i%2],
        CASE WHEN i%3=0 THEN 'SOLD' ELSE 'PUBLISHED' END,
        '2025-01-01'::timestamptz + i * interval '1 minute',
        CASE WHEN i%3=0 THEN '2026-01-01'::timestamptz ELSE NULL END
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO vehicle_listings(listing_id,vehicle_id)
        SELECT md5('plan-listing-'||i)::uuid,md5('plan-vehicle-'||i)::uuid
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO listing_locations(listing_id,point,public_point,city,country_code)
        SELECT md5('plan-listing-'||i)::uuid,ST_SetSRID(ST_MakePoint(2+(i%997)*0.006,49+((i*31)%991)*0.006),4326),
        CASE WHEN i%5=0 THEN NULL ELSE ST_SetSRID(ST_MakePoint(2+(i%997)*0.006+0.01,49+((i*31)%991)*0.006+0.01),4326) END,
        'Synthetic city','NL' FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO listing_media(id,listing_id,storage_key,sort_order,is_primary,status,width,height)
        SELECT md5('plan-media-'||i)::uuid,md5('plan-listing-'||i)::uuid,'media/plan/'||i||'/source',0,true,'READY',320,240
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO listing_media_variants(media_id,kind,storage_key,width,height,size)
        SELECT md5('plan-media-'||i)::uuid,kind,'media/plan/'||i||'/'||kind||'.webp',320,240,1000
        FROM generate_series($1::int,$2::int) i CROSS JOIN unnest(ARRAY['thumbnail','medium','large']) kind`,
        parameters,
      );
    }
    for (let start = 1; start <= partCount; start += 2000) {
      const parameters = [start, Math.min(partCount, start + 1999)];
      await source.query(
        `INSERT INTO parts(id,category_id,brand_id,name,condition,manufacturer_part_number,oem_number,fitment_mode)
        SELECT md5('plan-part-'||i)::uuid,
        ('a1000000-0000-4000-8000-'||lpad((1+(i%13))::text,12,'0'))::uuid,
        CASE WHEN i%7=0 THEN NULL ELSE ('a2000000-0000-4000-8000-'||lpad((1+(i%6))::text,12,'0'))::uuid END,
        'Deterministic part '||i,(ARRAY['NEW','USED','REFURBISHED','FOR_PARTS'])[1+i%4],
        'MFG-'||i,'OEM-'||i,CASE WHEN i%3=0 THEN 'UNIVERSAL' ELSE 'VEHICLE_SPECIFIC' END
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status,published_at,sold_at)
        SELECT md5('plan-part-listing-'||i)::uuid,'40000000-0000-4000-8000-000000000001','PART',
        'Deterministic part offer '||i,'Synthetic part performance fixture',50000+i*97,(ARRAY['EUR','USD'])[1+i%2],
        CASE WHEN i%4=0 THEN 'SOLD' ELSE 'PUBLISHED' END,
        '2025-06-01'::timestamptz + i * interval '1 minute',
        CASE WHEN i%4=0 THEN '2026-06-01'::timestamptz ELSE NULL END
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO part_listings(listing_id,type,part_id,quantity_available)
        SELECT md5('plan-part-listing-'||i)::uuid,'PART',md5('plan-part-'||i)::uuid,1+i%20
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO part_fitments(id,part_id,model_id,generation_id,year_from,year_to)
        SELECT md5('plan-fitment-'||i)::uuid,md5('plan-part-'||i)::uuid,
        ('20000000-0000-4000-8000-'||lpad((1+(i%6))::text,12,'0'))::uuid,
        CASE WHEN i%5=0 THEN NULL ELSE ('30000000-0000-4000-8000-'||lpad((1+(i%6))::text,12,'0'))::uuid END,
        2000+i%10,2020+i%6
        FROM generate_series($1::int,$2::int) i WHERE i%3<>0`,
        parameters,
      );
      await source.query(
        `INSERT INTO listing_locations(listing_id,point,public_point,city,country_code)
        SELECT md5('plan-part-listing-'||i)::uuid,ST_SetSRID(ST_MakePoint(2+(i%997)*0.006,49+((i*31)%991)*0.006),4326),
        CASE WHEN i%5=0 THEN NULL ELSE ST_SetSRID(ST_MakePoint(2+(i%997)*0.006+0.01,49+((i*31)%991)*0.006+0.01),4326) END,
        'Synthetic part city','NL' FROM generate_series($1::int,$2::int) i
        WHERE i%7<>0`,
        parameters,
      );
      await source.query(
        `INSERT INTO listing_media(id,listing_id,storage_key,sort_order,is_primary,status,width,height)
        SELECT md5('plan-part-media-'||i)::uuid,md5('plan-part-listing-'||i)::uuid,'media/plan-parts/'||i||'/source',0,true,'READY',320,240
        FROM generate_series($1::int,$2::int) i`,
        parameters,
      );
      await source.query(
        `INSERT INTO listing_media_variants(media_id,kind,storage_key,width,height,size)
        SELECT md5('plan-part-media-'||i)::uuid,kind,'media/plan-parts/'||i||'/'||kind||'.webp',320,240,1000
        FROM generate_series($1::int,$2::int) i CROSS JOIN unnest(ARRAY['thumbnail','medium','large']) kind`,
        parameters,
      );
    }
    await source.query('ANALYZE');
    const base = loadConfig('test');
    module = await Test.createTestingModule({
      imports: [
        AppModule.register({
          ...base,
          database: { ...base.database, name: String(source.options.database) },
        }),
      ],
    })
      .overrideProvider(DatabaseConnection)
      .useValue({ source, check: async () => {} })
      .compile();
    // Compile is sufficient for projection providers; do not start unrelated background work.
    const queries = module.get(ListingSearchQuery);
    const patterns: {
      pattern: string;
      input: Record<string, string>;
      map?: boolean;
    }[] = [
      { pattern: 'newest', input: {} },
      {
        pattern: 'model_year_price',
        input: {
          modelId: '20000000-0000-4000-8000-000000000002',
          yearFrom: '2018',
          yearTo: '2025',
          currency: 'USD',
          priceFromMinor: '500000',
          priceToMinor: '3500000',
        },
      },
      { pattern: 'price_asc', input: { sort: 'price_asc', currency: 'EUR' } },
      { pattern: 'bbox', input: { bbox: '4.8,51.8,5.2,52.2' } },
      {
        pattern: 'radius',
        input: { lat: '52', lng: '5', radiusMeters: '25000' },
      },
      { pattern: 'nearest', input: { lat: '52', lng: '5', sort: 'distance' } },
      {
        pattern: 'vehicle_map_high_zoom',
        input: { viewport: '4.8,51.8,5.2,52.2', zoom: '15' },
        map: true,
      },
      {
        pattern: 'vehicle_map_low_zoom',
        input: { viewport: '4.8,51.8,5.2,52.2', zoom: '5' },
        map: true,
      },
      {
        pattern: 'vehicle_map_broad_view',
        input: { viewport: '-180,-80,180,80', zoom: '2' },
        map: true,
      },
      { pattern: 'part_newest', input: { type: 'PART' } },
      {
        pattern: 'part_category_condition_price',
        input: {
          type: 'PART',
          categoryId: PART_CATEGORY_IDS.brakes,
          condition: 'REFURBISHED',
          currency: 'EUR',
          priceFromMinor: '100000',
          priceToMinor: '2500000',
        },
      },
      {
        pattern: 'part_brand',
        input: {
          type: 'PART',
          brandId: 'a2000000-0000-4000-8000-000000000002',
        },
      },
      { pattern: 'part_oem', input: { type: 'PART', oemNumber: 'OEM-17003' } },
      {
        pattern: 'part_manufacturer',
        input: { type: 'PART', manufacturerPartNumber: 'MFG-17003' },
      },
      {
        pattern: 'part_compatibility',
        input: {
          type: 'PART',
          compatibleModelId: '20000000-0000-4000-8000-000000000002',
          compatibleGenerationId: '30000000-0000-4000-8000-000000000002',
          compatibleYear: '2018',
          includeUniversal: 'false',
        },
      },
      {
        pattern: 'part_radius',
        input: {
          type: 'PART',
          lat: '52',
          lng: '5',
          radiusMeters: '25000',
        },
      },
      {
        pattern: 'part_nearest',
        input: { type: 'PART', lat: '52', lng: '5', sort: 'distance' },
      },
      {
        pattern: 'part_map_high_zoom',
        input: { type: 'PART', viewport: '4.8,51.8,5.2,52.2', zoom: '15' },
        map: true,
      },
      {
        pattern: 'part_map_compatibility_broad',
        input: {
          type: 'PART',
          viewport: '-180,-80,180,80',
          zoom: '2',
          compatibleModelId: '20000000-0000-4000-8000-000000000002',
          compatibleYear: '2018',
          includeUniversal: 'false',
        },
        map: true,
      },
    ];
    const results = [];
    for (const { pattern, input, map } of patterns) {
      const builder = map
        ? queries.mapClusters(parseMapQuery(input))
        : queries.page(parseSearchQuery(input));
      const [sql, parameters] = builder.getQueryAndParameters();
      const plans = await source.query<
        {
          'QUERY PLAN': {
            Plan: PlanNode;
            'Execution Time': number;
            'Planning Time': number;
          }[];
        }[]
      >(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, parameters);
      const plan = plans[0]?.['QUERY PLAN'][0];
      assert.ok(plan);
      const all = nodes(plan.Plan);
      const required: Record<string, string> = {
        newest: 'ix_listings_published_newest',
        price_asc: 'ix_listings_published_price',
        bbox: 'ix_listing_locations_point',
        radius: 'ix_listing_locations_geography',
        nearest: 'ix_listing_locations_geography',
        vehicle_map_high_zoom: 'ix_listing_locations_public_point',
        vehicle_map_low_zoom: 'ix_listing_locations_public_point',
        part_oem: 'ix_parts_oem_number',
        part_manufacturer: 'ix_parts_manufacturer_number',
        part_radius: 'ix_listing_locations_geography',
        part_nearest: 'ix_listing_locations_geography',
        part_map_high_zoom: 'ix_listing_locations_public_point',
      };
      if (required[pattern])
        assert.ok(
          all.some((node) => node['Index Name'] === required[pattern]),
          `${pattern} must use its reviewed index`,
        );
      if (pattern === 'nearest' || pattern === 'part_nearest')
        assert.ok(
          all.some((node) => String(node['Order By']).includes('<->')),
          'Nearest must use ordered GiST KNN',
        );
      results.push({
        pattern,
        executionMs: plan['Execution Time'],
        planningMs: plan['Planning Time'],
        rows: plan.Plan['Actual Rows'],
        indexes: [
          ...new Set(
            all.flatMap((node) =>
              node['Index Name'] ? [node['Index Name']] : [],
            ),
          ),
        ],
        nodes: all.map((node) => ({
          type: node['Node Type'],
          index: node['Index Name'],
          rows: node['Actual Rows'],
          loops: node['Actual Loops'],
          order: node['Order By'],
          sort: node['Sort Key'],
        })),
      });
    }
    const report = {
      type: 'development_query_plan_review',
      listings: vehicleCount + partCount + 3,
      vehicles: vehicleCount + 3,
      parts: partCount,
      published: 20003 + 18750,
      variants: (vehicleCount + partCount) * 3,
      results,
    };
    const directory = join(workspaceRoot(), '.tools');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'search-plan-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(
      JSON.stringify(
        {
          ...report,
          results: results.map(({ nodes: planNodes, ...summary }) => ({
            ...summary,
            spatialOrder: planNodes.filter((node) => node.order),
            sorts: planNodes.filter((node) => node.type.includes('Sort')),
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      if (module) await module.close();
    } finally {
      await database.close();
    }
  }
}
void main().catch(() => {
  process.stderr.write('Search query-plan review failed\n');
  process.exitCode = 1;
});
