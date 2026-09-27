import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Logger } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { RedisConnection } from '../../src/platform/redis/redis.connection';
import {
  RequestRateGuard,
  REQUEST_RATE_POLICIES,
} from '../../src/platform/http/request-rate.guard';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import { ListingSearchQuery } from '../../src/modules/search/infrastructure/listing-search-query';
import { parseSearchQuery } from '../../src/modules/search';
import type {
  SearchResponse,
  MapResponse,
  FacetResponse,
} from '../../src/modules/search/http/search.dto';
import { createSchemaDatabase } from '../support/schema-database';
import {
  seedMarketplaceFixture,
  fixture,
} from '../support/marketplace-fixture';
import { seedReadyPhoto } from '../support/ready-media-fixture';

class Counter implements Logger {
  queries: string[] = [];
  logQuery(query: string) {
    this.queries.push(query);
  }
  logQueryError() {}
  logQuerySlow() {}
  logSchemaBuild() {}
  logMigration() {}
  log() {}
}
class SilentLogger extends StructuredLogger {
  override event() {}
}
test(
  'public search HTTP on owned PostGIS database',
  { timeout: 120000 },
  async (t) => {
    const database = await createSchemaDatabase();
    const { source } = database;
    let http: INestApplication | undefined;
    try {
      const base = loadConfig('test');
      const config = {
        ...base,
        swagger: true,
        database: { ...base.database, name: String(source.options.database) },
      };
      await source.runMigrations();
      await seedMarketplaceFixture(source);
      await source.query('DELETE FROM listing_media');
      await source.query("UPDATE listings SET description = 'Search fixture'");
      for (const id of fixture.listings) await seedReadyPhoto(source, id);
      const counter = new Counter();
      source.logger = counter;
      const module = await Test.createTestingModule({
        imports: [AppModule.register(config)],
      })
        .overrideProvider(DatabaseConnection)
        .useValue({ source, check: async () => {} })
        .overrideProvider(ObjectStorage)
        .useValue({
          readUrl: async () => 'https://processed.example.test/thumbnail.webp',
        })
        .overrideProvider(StructuredLogger)
        .useValue(new SilentLogger(config))
        .overrideGuard(RequestRateGuard)
        .useValue({ canActivate: () => true })
        .compile();
      http = module.createNestApplication({
        bodyParser: false,
        logger: false,
      });
      configureApp(http, config);
      await http.listen(0, '127.0.0.1');
      const origin = await http.getUrl();
      const read = async (
        query = '',
        path = 'listings',
      ): Promise<SearchResponse> => {
        const response = await fetch(
          `${origin}/api/v1/${path}${query ? '?' + query : ''}`,
        );
        assert.equal(response.status, 200, await response.clone().text());
        assert.equal(response.headers.get('cache-control'), 'no-store');
        return response.json();
      };
      const ids = (value: SearchResponse) => value.items.map((item) => item.id);
      const invalid = async (query: string, code: string) => {
        const response = await fetch(`${origin}/api/v1/listings?${query}`);
        assert.equal(response.status, 400);
        const result = await response.json();
        assert.equal(result.code, code);
        assert.ok(result.requestId);
        assert.ok(!JSON.stringify(result).includes('SELECT'));
      };
      const add = async (
        overrides: {
          status?: string;
          lat?: number;
          lng?: number;
          publicLat?: number;
          publicLng?: number;
          price?: string;
          currency?: string;
          published?: string;
          vehicleId?: string;
        } = {},
      ) => {
        const id = randomUUID();
        const status = overrides.status ?? 'PUBLISHED';
        await source.query(
          "INSERT INTO listings(id,seller_id,title,description,price_minor,currency,status,published_at,submitted_at,sold_at,archived_at) VALUES ($1,$2,$3,$4,$5,$6,$7::varchar,$8::timestamptz,$8::timestamptz,CASE WHEN $7::varchar='SOLD' THEN $8::timestamptz ELSE NULL END,CASE WHEN $7::varchar='ARCHIVED' THEN $8::timestamptz ELSE NULL END)",
          [
            id,
            fixture.seller,
            'Synthetic search',
            'Valid description',
            overrides.price ?? '2500000',
            overrides.currency ?? 'EUR',
            status,
            overrides.published ?? '2026-01-02T00:00:00.000001Z',
          ],
        );
        await source.query(
          'INSERT INTO vehicle_listings(listing_id, vehicle_id) VALUES ($1,$2)',
          [id, overrides.vehicleId ?? fixture.vehicles[0]],
        );
        await source.query(
          'INSERT INTO listing_locations(listing_id,point,public_point,city,country_code) VALUES ($1,ST_SetSRID(ST_MakePoint($2,$3),4326),CASE WHEN $4::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($4,$5),4326) END,$6,$7)',
          [
            id,
            overrides.lng ?? 4.9041,
            overrides.lat ?? 52.3676,
            overrides.publicLng ?? null,
            overrides.publicLat ?? null,
            'Synthetic',
            'NL',
          ],
        );
        await seedReadyPhoto(source, id);
        return id;
      };
      await t.test(
        'published only, invalid legacy/media invariant rows are excluded',
        async () => {
          for (const status of [
            'DRAFT',
            'PENDING_MODERATION',
            'REJECTED',
            'SOLD',
            'ARCHIVED',
          ])
            await add({ status });
          const legacy = await add();
          await source.query(
            "UPDATE listing_media SET is_primary=false,status='FAILED' WHERE listing_id=$1",
            [legacy],
          );
          const incomplete = await add();
          await source.query(
            "DELETE FROM listing_media_variants WHERE media_id IN (SELECT id FROM listing_media WHERE listing_id=$1) AND kind='large'",
            [incomplete],
          );
          assert.deepEqual(
            new Set(ids(await read())),
            new Set(fixture.listings),
          );
        },
      );
      await t.test(
        'all structured filters, relation mismatch and combined ranges',
        async () => {
          const vehicleId = randomUUID();
          await source.query(
            "INSERT INTO vehicles(id,model_id,generation_id,year,mileage_km,body_type,fuel_type,transmission,drive_type,condition,color) VALUES ($1,$2,$3,2025,5000,'SUV','ELECTRIC','MANUAL','AWD','NEW','RED')",
            [
              vehicleId,
              '20000000-0000-4000-8000-000000000003',
              fixture.otherGeneration,
            ],
          );
          const alternate = await add({ vehicleId, price: '1000000' });
          const yes = [
            'makeId=10000000-0000-4000-8000-000000000001',
            `modelId=${fixture.model}`,
            `generationId=${fixture.generation}`,
            'yearFrom=2021&yearTo=2023',
            'currency=EUR&priceFromMinor=2000000&priceToMinor=3000000',
            'mileageFrom=5000&mileageTo=20000',
            'bodyType=SEDAN,SUV',
            'fuelType=PETROL,DIESEL',
            'transmission=AUTOMATIC',
            'driveType=RWD',
            'condition=USED',
            'color=BLUE',
          ];
          for (const query of yes)
            assert.ok((await read(query)).items.length > 0, query);
          for (const query of [
            'bodyType=VAN',
            `makeId=10000000-0000-4000-8000-000000000002&modelId=${fixture.model}`,
          ])
            assert.equal((await read(query)).items.length, 0, query);
          for (const query of [
            'makeId=10000000-0000-4000-8000-000000000002',
            'modelId=20000000-0000-4000-8000-000000000003',
            `generationId=${fixture.otherGeneration}`,
            'yearFrom=2024',
            'mileageTo=5000&mileageFrom=5000',
            'bodyType=SUV',
            'fuelType=ELECTRIC',
            'transmission=MANUAL',
            'driveType=AWD',
            'condition=NEW',
            'color=RED',
          ])
            assert.deepEqual(ids(await read(query)), [alternate], query);
          assert.deepEqual(
            ids(
              await read(
                `modelId=${fixture.model}&generationId=${fixture.generation}&yearFrom=2022&yearTo=2022&currency=EUR&priceFromMinor=2500000&priceToMinor=2500000&mileageFrom=10000&mileageTo=10000&bodyType=SEDAN&fuelType=PETROL&transmission=AUTOMATIC&driveType=RWD&condition=USED&color=BLUE`,
              ),
            ),
            [fixture.listings[1]],
          );
          const usd = await add({ currency: 'USD', price: '2500000' });
          assert.ok(
            !ids(await read('currency=EUR&priceToMinor=3000000')).includes(usd),
          );
          assert.deepEqual(
            ids(await read('currency=USD&priceToMinor=3000000')),
            [usd],
          );
        },
      );
      await t.test(
        'all stable sorts and cursors preserve ties and microseconds across pages',
        async () => {
          await add({
            price: '2500000',
            published: '2026-01-02T00:00:00.123456Z',
          });
          await add({
            price: '2500000',
            published: '2026-01-02T00:00:00.123457Z',
          });
          for (const sort of [
            'newest',
            'price_asc',
            'price_desc',
            'mileage_asc',
            'year_desc',
            'distance',
          ]) {
            const query = `sort=${sort}&currency=EUR${sort === 'distance' ? '&lat=52.3676&lng=4.9041' : ''}`;
            const whole = ids(await read(query + '&limit=50'));
            const pages: string[] = [];
            let cursor: string | null = null;
            do {
              const page = await read(
                query +
                  '&limit=1' +
                  (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
              );
              pages.push(...ids(page));
              cursor = page.page.nextCursor;
            } while (cursor);
            assert.deepEqual(pages, whole, sort);
            assert.equal(new Set(pages).size, pages.length);
          }
          const asc = await read('sort=price_asc&currency=EUR');
          assert.equal(asc.items.at(-1)?.price.amountMinor, '9007199254740993');
          assert.equal(
            (await read('sort=price_desc&currency=EUR')).items[0]?.price
              .amountMinor,
            '9007199254740993',
          );
          const mileage = (await read('sort=mileage_asc')).items[0];
          const year = (await read('sort=year_desc')).items[0];
          assert.equal(mileage?.type, 'VEHICLE');
          assert.equal(year?.type, 'VEHICLE');
          if (mileage?.type === 'VEHICLE')
            assert.equal(mileage.vehicle.mileageKm, 0);
          if (year?.type === 'VEHICLE') assert.equal(year.vehicle.year, 2025);
        },
      );
      await t.test(
        'changed filters, geo and sort reject cursors; tampering/injection is bounded',
        async () => {
          const cursor = (await read('limit=1')).page.nextCursor;
          assert.ok(cursor);
          await invalid(
            'cursor=' + encodeURIComponent(cursor) + '&currency=EUR',
            'SEARCH_CURSOR_QUERY_MISMATCH',
          );
          await invalid(
            'cursor=' + encodeURIComponent(cursor) + '&lat=0&lng=0',
            'SEARCH_CURSOR_QUERY_MISMATCH',
          );
          await invalid('cursor=not-a-cursor', 'SEARCH_INVALID_CURSOR');
          await invalid(
            'sort=' + encodeURIComponent('newest; DROP TABLE listings'),
            'SEARCH_INVALID_SORT',
          );
          await invalid(
            'makeId=' + encodeURIComponent("' OR 1=1 --"),
            'SEARCH_INVALID_FILTER',
          );
          await invalid(
            'fuelType=' + encodeURIComponent("PETROL');--"),
            'SEARCH_INVALID_FILTER',
          );
          await invalid('yearFrom=2023&yearTo=2020', 'VALIDATION_ERROR');
          await invalid('priceFromMinor=100', 'SEARCH_INVALID_FILTER');
          await invalid('sort=distance', 'SEARCH_LOCATION_REQUIRED');
          await invalid('bbox=0,0,1,1&lat=0&lng=0', 'GEO_CONFLICTING_FILTERS');
          await invalid(
            'lat=0&lng=0&radiusMeters=250001',
            'GEO_INVALID_RADIUS',
          );
          await invalid(
            'fuelType=PETROL&fuelType=DIESEL',
            'SEARCH_INVALID_FILTER',
          );
          assert.ok((await read()).items.length);
        },
      );
      await t.test(
        'new publication between pages appears before cursor without duplicates',
        async () => {
          const first = await read('limit=1');
          const newId = await add({ published: '2026-02-01T00:00:00Z' });
          const next = await read(
            'limit=50&cursor=' +
              encodeURIComponent(first.page.nextCursor ?? ''),
          );
          assert.ok(!ids(next).includes(newId));
          assert.ok(!ids(next).includes(first.items[0]?.id ?? ''));
        },
      );
      await t.test(
        'bbox is inclusive and antimeridian wraps both hemispheres',
        async () => {
          const boundary = await add({ lat: 0, lng: 1 });
          const outside = await add({ lat: 0, lng: 1.001 });
          assert.deepEqual(ids(await read('bbox=0,0,1,1')), [boundary]);
          assert.deepEqual(ids(await read('bbox=1,0,1,0')), [boundary]);
          assert.deepEqual(ids(await read('bbox=1,-1,1,1')), [boundary]);
          assert.deepEqual(ids(await read('bbox=0,0,1,0')), [boundary]);
          assert.ok(!ids(await read('bbox=0,0,1,1')).includes(outside));
          const east = await add({ lat: 0, lng: 179.5 });
          const west = await add({ lat: 0, lng: -179.5 });
          assert.deepEqual(
            new Set(ids(await read('bbox=179,-1,-179,1'))),
            new Set([east, west]),
          );
          assert.deepEqual(
            new Set(
              ids(
                await read('lat=0&lng=180&radiusMeters=100000&sort=distance'),
              ),
            ),
            new Set([east, west]),
          );
        },
      );
      await t.test(
        'radius/nearest use exact point internally; output distance buckets and public point only',
        async () => {
          const privateId = await add({ lat: 10, lng: 10 });
          const publicId = await add({
            lat: 10,
            lng: 10.005,
            publicLat: 11,
            publicLng: 11,
          });
          const far = await add({ lat: 10, lng: 10.02 });
          const result = await read(
            'lat=10&lng=10&radiusMeters=1000&sort=distance',
          );
          assert.deepEqual(ids(result), [privateId, publicId]);
          assert.equal(result.items[0]?.location?.publicPoint, null);
          assert.deepEqual(result.items[1]?.location?.publicPoint, {
            latitude: 11,
            longitude: 11,
          });
          assert.equal(result.items[1]?.location?.distanceMeters, 0);
          assert.ok(!ids(result).includes(far));
          const distances = await read(
            'lat=10&lng=10&radiusMeters=3000&sort=distance',
          );
          assert.equal(distances.items[2]?.location?.distanceMeters, 2000);
          const serialized = JSON.stringify(distances);
          for (const property of [
            'exactPoint',
            'point',
            'storageKey',
            'thumbnailKey',
            'seller',
            'vin',
            'version',
            'media',
          ])
            assert.ok(!serialized.includes('"' + property + '"'), property);
          assert.ok(!serialized.includes('10.005'));
          const tie = await add({ lat: 10, lng: 10 });
          const nearest = await read(
            'lat=10&lng=10&radiusMeters=1000&sort=distance',
          );
          assert.deepEqual(
            ids(nearest).slice(0, 2),
            [privateId, tie].sort().reverse(),
          );
        },
      );
      await t.test(
        'map viewport clusters public geometry, intersects search geo and bounds features',
        async () => {
          const result: MapResponse = await (
            await fetch(
              `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&zoom=22&limit=1`,
            )
          ).json();
          assert.equal(result.features.length, 1);
          const firstFeature = result.features[0];
          assert.equal(firstFeature?.kind, 'LISTING');
          assert.deepEqual(
            firstFeature?.kind === 'LISTING' && firstFeature.publicPoint,
            {
              latitude: 11,
              longitude: 11,
            },
          );
          await add({ lat: 40, lng: 40, publicLat: 11, publicLng: 11 });
          await add({ lat: 40, lng: 40, publicLat: 11.09, publicLng: 11.09 });
          const truncated: MapResponse = await (
            await fetch(
              `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&zoom=22&limit=1`,
            )
          ).json();
          assert.equal(truncated.truncated, true);
          assert.equal(truncated.features.length, 1);
          assert.equal(truncated.features[0]?.kind, 'LISTING');
          const clustered: MapResponse = await (
            await fetch(
              `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&zoom=5`,
            )
          ).json();
          assert.equal(clustered.features[0]?.kind, 'CLUSTER');
          if (clustered.features[0]?.kind === 'CLUSTER') {
            assert.equal(clustered.features[0].count, 3);
            assert.equal(clustered.features[0].bounds.west, 11);
            assert.equal(clustered.features[0].bounds.east, 11.09);
          }
          const intersection: MapResponse = await (
            await fetch(
              `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&lat=10&lng=10&radiusMeters=1000&zoom=22`,
            )
          ).json();
          assert.equal(intersection.features.length, 1);
          assert.equal(intersection.features[0]?.kind, 'LISTING');
          const bboxIntersection: MapResponse = await (
            await fetch(
              `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&bbox=39.9,39.9,40.1,40.1&zoom=5`,
            )
          ).json();
          assert.equal(bboxIntersection.features[0]?.kind, 'CLUSTER');
          if (bboxIntersection.features[0]?.kind === 'CLUSTER')
            assert.equal(bboxIntersection.features[0].count, 2);
          await add({ lat: 0, lng: 0, publicLat: 0, publicLng: 179.5 });
          await add({ lat: 0, lng: 0, publicLat: 0, publicLng: -179.5 });
          const crossing: MapResponse = await (
            await fetch(
              `${origin}/api/v1/search/listings/map?viewport=179,-1,-179,1&zoom=22`,
            )
          ).json();
          assert.equal(crossing.features.length, 2);
          assert.ok(
            crossing.features.every((feature) => feature.kind === 'LISTING'),
          );
          const sold = await add({
            status: 'SOLD',
            publicLat: 11,
            publicLng: 11,
          });
          const mapAll: MapResponse = await (
            await fetch(
              `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&zoom=22&limit=500`,
            )
          ).json();
          assert.equal(mapAll.features.length, 2);
          assert.ok(
            !mapAll.features.some(
              (item) => item.kind === 'LISTING' && item.listingId === sold,
            ),
          );
          assert.ok(!JSON.stringify(mapAll).includes('"latitude":40'));
          assert.ok(!JSON.stringify(mapAll).includes('"longitude":40'));
          counter.queries = [];
          await fetch(
            `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&zoom=22`,
          );
          assert.equal(
            counter.queries.filter((query) => query.startsWith('SELECT'))
              .length,
            2,
          );
          counter.queries = [];
          await fetch(
            `${origin}/api/v1/search/listings/map?viewport=10.9,10.9,11.1,11.1&zoom=5`,
          );
          assert.equal(
            counter.queries.filter((query) => query.startsWith('SELECT'))
              .length,
            1,
          );
          assert.equal(
            (
              await fetch(
                `${origin}/api/v1/search/listings/map?bbox=-180,-90,180,90&limit=501`,
              )
            ).status,
            400,
          );
        },
      );
      await t.test(
        'facets count after all filters separately; projection performs one SELECT independent of limit',
        async () => {
          const response = await fetch(
            `${origin}/api/v1/search/listings/facets?currency=USD`,
          );
          assert.equal(response.status, 200, await response.clone().text());
          const facets: FacetResponse = await response.json();
          assert.equal(facets.semantics, 'after_all_filters');
          assert.equal(facets.type, 'VEHICLE');
          if ('fuelType' in facets.facets)
            assert.deepEqual(facets.facets.fuelType, [
              { value: 'PETROL', count: 1 },
            ]);
          for (let i = 0; i < 30; i++) await add();
          for (const limit of [1, 50]) {
            counter.queries = [];
            await read(`limit=${limit}`);
            const queries = counter.queries.filter((query) =>
              query.startsWith('SELECT'),
            );
            assert.equal(queries.length, 1);
            assert.ok(!queries[0]?.includes('COUNT('));
            assert.ok(!queries[0]?.includes('OFFSET'));
          }
          const query = module
            .get(ListingSearchQuery)
            .page(parseSearchQuery({ bbox: '179,-1,-179,1' }))
            .getQueryAndParameters();
          assert.ok(query[0].includes('ST_Intersects'));
          assert.ok(query[1].includes(179));
        },
      );
      await t.test(
        'real Redis has separate bounded anonymous ordinary/geo/facet/map policies',
        async () => {
          const guard = new RequestRateGuard(
            new Reflector(),
            config,
            module.get(RedisConnection),
          );
          for (const policy of [
            'search',
            'searchGeo',
            'searchFacets',
            'searchMap',
          ] as const) {
            const limit = REQUEST_RATE_POLICIES[policy].limit;
            const identifier = `search-test-${randomUUID()}`;
            const attempts = await Promise.all(
              Array.from({ length: limit + 1 }, () =>
                guard.consume(policy, identifier),
              ),
            );
            assert.equal(attempts.filter((retry) => retry === 0).length, limit);
            assert.equal(attempts.filter((retry) => retry > 0).length, 1);
          }
        },
      );
      await t.test(
        'OpenAPI includes query contracts and ORM schema remains aligned',
        async () => {
          const response = await fetch(`${origin}/api/docs-json`);
          assert.equal(response.status, 200);
          const swagger = await response.json();
          assert.ok(
            swagger.paths['/api/v1/listings'].get.parameters.some(
              (parameter: { name: string }) => parameter.name === 'cursor',
            ),
          );
          const mapOperation = swagger.paths['/api/v1/search/listings/map'].get;
          assert.ok(mapOperation);
          assert.ok(
            mapOperation.parameters.some(
              (parameter: { name: string }) => parameter.name === 'viewport',
            ),
          );
          assert.ok(
            mapOperation.parameters.some(
              (parameter: { name: string }) => parameter.name === 'zoom',
            ),
          );
          assert.ok(swagger.paths['/api/v1/search/listings/facets']);
          assert.equal(
            (await source.driver.createSchemaBuilder().log()).upQueries.length,
            0,
          );
        },
      );
    } finally {
      try {
        if (http) await http.close();
      } finally {
        await database.close();
      }
    }
  },
);
