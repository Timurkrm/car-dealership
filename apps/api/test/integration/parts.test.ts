import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { RequestRateGuard } from '../../src/platform/http/request-rate.guard';
import { AuditWriter } from '../../src/modules/audit';
import { AuthTokens } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { OwnerPartListingResponse } from '../../src/modules/listings/http/part-listing.dto';
import {
  seedPartCatalog,
  PART_CATEGORY_IDS,
  PART_BRAND_IDS,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';
import { PartCatalog } from '../../src/modules/parts/application/part-catalog';
import { Part } from '../../src/modules/parts/infrastructure/persistence/part.entity';
import { PartCategory } from '../../src/modules/parts/infrastructure/persistence/part-category.entity';
import { createSchemaDatabase } from '../support/schema-database';
import { seedReadyPhoto } from '../support/ready-media-fixture';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';

const input = () => ({
  part: {
    categoryId: PART_CATEGORY_IDS.pads,
    brandId: PART_BRAND_IDS.bosch,
    name: ' Brake pads ',
    condition: 'NEW',
    manufacturerPartNumber: ' ab-123 ',
    oemNumber: ' 34.56/7 ',
    fitment: { mode: 'UNIVERSAL', vehicles: [] },
  },
  quantityAvailable: 3,
  listing: {
    title: 'Front brake pads',
    description: 'Unused original pads.',
    price: { amountMinor: '9007199254740993', currency: 'EUR' },
  },
});
test(
  'Parts marketplace: shared listing identity, fitment, CAS, projections and systems',
  { timeout: 180000 },
  async (t) => {
    const db = await createSchemaDatabase();
    const { source } = db;
    const base = loadConfig('test');
    const config = {
      ...base,
      swagger: true,
      database: { ...base.database, name: String(source.options.database) },
    };
    await source.runMigrations();
    await seedMarketplaceFixture(source);
    await source.transaction(seedPartCatalog);
    await source.query('UPDATE users SET email_verified_at=CURRENT_TIMESTAMP');
    await source.query(
      'UPDATE user_sessions SET last_used_at=CURRENT_TIMESTAMP',
    );
    const session = randomUUID();
    await source.query(
      'INSERT INTO user_sessions(id,user_id,expires_at,last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
      [session, fixture.buyer, '2100-01-01'],
    );
    const audit = new AuditWriter(source);
    const append = audit.append.bind(audit);
    let failAudit = false;
    audit.append = async (entry, manager) => {
      if (failAudit) throw new Error('simulated audit failure');
      return append(entry, manager);
    };
    const module = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    })
      .overrideProvider(DatabaseConnection)
      .useValue({
        source,
        check: async () => {
          await source.query('SELECT 1');
        },
      })
      .overrideProvider(ObjectStorage)
      .useValue({
        readUrl: async () => 'https://processed.example.test/thumbnail.webp',
      })
      .overrideProvider(AuditWriter)
      .useValue(audit)
      .overrideGuard(RequestRateGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const server = module.createNestApplication({
      bodyParser: false,
      logger: false,
    });
    configureApp(server, config);
    try {
      await server.listen(0, '127.0.0.1');
      const origin = await server.getUrl();
      const tokens = server.get(AuthTokens);
      const access = await tokens.issue({
        userId: fixture.seller,
        sessionId: fixture.session,
        roles: ['USER'],
      });
      const foreign = await tokens.issue({
        userId: fixture.buyer,
        sessionId: session,
        roles: ['USER'],
      });
      const request = (
        path: string,
        method = 'GET',
        body?: object,
        version?: number,
        token = access,
      ) =>
        fetch(origin + '/api/v1/' + path, {
          method,
          headers: {
            ...(token ? { authorization: 'Bearer ' + token } : {}),
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...(version ? { 'if-match': '"' + version + '"' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      async function error(response: Response, status: number, code?: string) {
        const row: unknown = await response.json();
        assert.equal(response.status, status, JSON.stringify(row));
        if (code) {
          assert.ok(row && typeof row === 'object' && 'code' in row);
          assert.equal(row.code, code);
        }
      }
      async function owner(response: Response, status = 200) {
        const row: unknown = await response.json();
        assert.equal(response.status, status, JSON.stringify(row));
        const value = plainToInstance(OwnerPartListingResponse, row);
        assert.equal(value.type, 'PART');
        assert.equal(response.headers.get('etag'), '"' + value.version + '"');
        return value;
      }
      const create = async (body: object = input()) =>
        owner(await request('parts/listings', 'POST', body), 201);
      const patch = async (row: OwnerPartListingResponse, body: object) =>
        owner(
          await request(
            'me/part-listings/' + row.id,
            'PATCH',
            body,
            row.version,
          ),
        );
      let row = await create();
      await t.test(
        'catalog references are idempotent, active-only, hierarchical, deterministic and bounded',
        async () => {
          await source.transaction(seedPartCatalog);
          await source.transaction(seedPartCatalog);
          const response = await request(
            'catalog/part-categories?limit=50',
            'GET',
            undefined,
            undefined,
            '',
          );
          const body: { items: { id: string; parentId: string | null }[] } =
            await response.json();
          assert.equal(response.status, 200);
          assert.equal(body.items.length, 13);
          assert.equal(
            body.items.find((item) => item.id === PART_CATEGORY_IDS.pads)
              ?.parentId,
            PART_CATEGORY_IDS.brakes,
          );
          const brands: { items: { id: string }[] } = await (
            await request('catalog/part-brands?limit=50')
          ).json();
          assert.equal(brands.items.length, 6);
          await source.query(
            'UPDATE part_categories SET is_active=false WHERE id=$1',
            [PART_CATEGORY_IDS.pads],
          );
          const active: { items: { id: string }[] } = await (
            await request('catalog/part-categories?limit=50')
          ).json();
          assert.equal(
            active.items.some((item) => item.id === PART_CATEGORY_IDS.pads),
            false,
          );
          await source.query(
            'UPDATE part_categories SET is_active=true WHERE id=$1',
            [PART_CATEGORY_IDS.pads],
          );
          await error(
            await request('catalog/part-brands?limit=5000'),
            400,
            'VALIDATION_ERROR',
          );
          assert.deepEqual(
            await (await request('catalog/part-categories?limit=2')).json(),
            await (await request('catalog/part-categories?limit=2')).json(),
          );
        },
      );
      await t.test(
        'part draft needs no location; distinct titles, canonical numbers, quantity and no vehicle payload',
        async () => {
          assert.equal(row.location, null);
          assert.equal(row.part.name, 'Brake pads');
          assert.equal(row.title, 'Front brake pads');
          assert.equal(row.part.manufacturerPartNumber, 'AB-123');
          assert.equal(row.part.oemNumber, '34.56/7');
          assert.equal(row.part.quantityAvailable, 3);
          assert.equal('vehicle' in row, false);
          assert.equal(row.price.amountMinor, '9007199254740993');
          const roots: { id: string }[] = await source.query(
            'SELECT id FROM listings WHERE id=$1 AND type=$2',
            [row.id, 'PART'],
          );
          assert.equal(roots.length, 1);
          await error(
            await request('parts/listings', 'POST', input(), undefined, ''),
            401,
          );
          await error(
            await request(
              'me/listings/' + row.id,
              'PATCH',
              { listing: { title: 'Wrong endpoint' } },
              row.version,
            ),
            404,
            'LISTING_NOT_FOUND',
          );
          await error(
            await request(
              'me/part-listings/' + fixture.listings[0],
              'PATCH',
              { quantityAvailable: 1 },
              1,
            ),
            404,
            'LISTING_NOT_FOUND',
          );
          await error(
            await request(
              'me/part-listings/' + row.id,
              'PATCH',
              { vehicle: { year: 2022 } },
              row.version,
            ),
            400,
            'VALIDATION_ERROR',
          );
          await error(
            await request('parts/listings/' + fixture.listings[0]),
            404,
            'LISTING_NOT_FOUND',
          );
          await error(
            await request('listings/' + row.id),
            404,
            'LISTING_NOT_FOUND',
          );
        },
      );
      await t.test(
        'fitment replacement validates catalog relation, duplicates, ranges and universal conflicts atomically',
        async () => {
          row = await patch(row, {
            part: {
              fitment: {
                mode: 'VEHICLE_SPECIFIC',
                vehicles: [
                  {
                    modelId: fixture.model,
                    generationId: fixture.generation,
                    yearFrom: 2018,
                    yearTo: 2024,
                  },
                  { modelId: fixture.model, generationId: null },
                ],
              },
            },
          });
          assert.equal(row.part.fitments.length, 2);
          assert.equal(row.part.fitments[0]?.make.name, 'BMW');
          for (const fitment of [
            { mode: 'UNIVERSAL', vehicles: [{ modelId: fixture.model }] },
            {
              mode: 'VEHICLE_SPECIFIC',
              vehicles: [
                { modelId: fixture.model },
                { modelId: fixture.model, generationId: null },
              ],
            },
            {
              mode: 'VEHICLE_SPECIFIC',
              vehicles: [
                { modelId: fixture.model, yearFrom: 2024, yearTo: 2020 },
              ],
            },
            {
              mode: 'VEHICLE_SPECIFIC',
              vehicles: [
                { modelId: randomUUID(), generationId: fixture.generation },
              ],
            },
          ])
            await error(
              await request(
                'me/part-listings/' + row.id,
                'PATCH',
                { part: { fitment } },
                row.version,
              ),
              400,
            );
          const reread = await owner(await request('me/listings/' + row.id));
          assert.equal(reread.version, row.version);
          assert.deepEqual(reread.part.fitments, row.part.fitments);
          const wrongModel = randomUUID();
          await source.query(
            'INSERT INTO vehicle_models(id,make_id,name,slug) VALUES ($1,$2,$3,$4)',
            [
              wrongModel,
              '10000000-0000-4000-8000-000000000001',
              'Other model',
              'other-model',
            ],
          );
          await error(
            await request(
              'me/part-listings/' + row.id,
              'PATCH',
              {
                part: {
                  fitment: {
                    mode: 'VEHICLE_SPECIFIC',
                    vehicles: [
                      { modelId: wrongModel, generationId: fixture.generation },
                    ],
                  },
                },
              },
              row.version,
            ),
            400,
            'VEHICLE_GENERATION_MODEL_MISMATCH',
          );
          row = await patch(row, {
            part: {
              fitment: { mode: 'UNIVERSAL', vehicles: [] },
              brandId: null,
              oemNumber: null,
            },
          });
          assert.equal(row.part.fitments.length, 0);
          assert.equal(row.part.brand, null);
          assert.equal(row.part.oemNumber, null);
        },
      );
      await t.test(
        'invalid/inactive references, unbounded inputs and audit failure leave no orphan roots, products or fitments',
        async () => {
          const counts = () =>
            source.query(
              'SELECT (SELECT count(*) FROM listings) listings,(SELECT count(*) FROM parts) parts,(SELECT count(*) FROM part_listings) offers,(SELECT count(*) FROM part_fitments) fitments,(SELECT count(*) FROM listing_locations) locations,(SELECT count(*) FROM audit_logs) audits',
            );
          const before: unknown = await counts();
          for (const body of [
            { ...input(), quantityAvailable: 0 },
            { ...input(), quantityAvailable: 1000001 },
            { ...input(), part: { ...input().part, categoryId: randomUUID() } },
            { ...input(), part: { ...input().part, brandId: randomUUID() } },
            {
              ...input(),
              part: {
                ...input().part,
                fitment: {
                  mode: 'VEHICLE_SPECIFIC',
                  vehicles: Array.from({ length: 51 }, () => ({
                    modelId: fixture.model,
                  })),
                },
              },
            },
          ])
            await error(await request('parts/listings', 'POST', body), 400);
          await source.query(
            'UPDATE part_categories SET is_active=false WHERE id=$1',
            [PART_CATEGORY_IDS.pads],
          );
          await error(await request('parts/listings', 'POST', input()), 400);
          await source.query(
            'UPDATE part_categories SET is_active=true WHERE id=$1',
            [PART_CATEGORY_IDS.pads],
          );
          assert.deepEqual(await counts(), before);
          failAudit = true;
          try {
            await error(
              await request('parts/listings', 'POST', {
                ...input(),
                part: {
                  ...input().part,
                  fitment: {
                    mode: 'VEHICLE_SPECIFIC',
                    vehicles: [{ modelId: fixture.model }],
                  },
                },
                location: {
                  latitude: 52,
                  longitude: 4,
                  city: 'Amsterdam',
                  countryCode: 'NL',
                },
              }),
              500,
            );
          } finally {
            failAudit = false;
          }
          assert.deepEqual(await counts(), before);
        },
      );
      await t.test(
        'failed part edit rolls back fitments, stock, common fields, location, version and audit together',
        async () => {
          const before = await owner(await request('me/listings/' + row.id));
          failAudit = true;
          try {
            await error(
              await request(
                'me/part-listings/' + row.id,
                'PATCH',
                {
                  quantityAvailable: 9,
                  listing: { title: 'Rollback title' },
                  part: {
                    name: 'Rollback part',
                    fitment: {
                      mode: 'VEHICLE_SPECIFIC',
                      vehicles: [{ modelId: fixture.model }],
                    },
                  },
                  location: {
                    latitude: 52,
                    longitude: 4,
                    city: 'Amsterdam',
                    countryCode: 'NL',
                  },
                },
                row.version,
              ),
              500,
            );
          } finally {
            failAudit = false;
          }
          assert.deepEqual(
            await owner(await request('me/listings/' + row.id)),
            before,
          );
        },
      );
      await t.test(
        'IDOR prevents reads, edits, transitions and media access through shared listing owner policy',
        async () => {
          for (const [path, method, body] of [
            ['me/listings/' + row.id, 'GET', undefined],
            ['me/part-listings/' + row.id, 'PATCH', { quantityAvailable: 2 }],
            ['me/listings/' + row.id + '/submit', 'POST', {}],
            ['me/listings/' + row.id + '/archive', 'POST', {}],
            ['me/listings/' + row.id + '/mark-sold', 'POST', {}],
            ['me/listings/' + row.id + '/media', 'GET', undefined],
          ] as const)
            await error(
              await request(path, method, body, row.version, foreign),
              404,
              'LISTING_NOT_FOUND',
            );
        },
      );
      await t.test(
        'CAS rejects stale fitment writes; competing edits commit one version and one inventory update',
        async () => {
          const initial = row;
          row = await patch(row, { quantityAvailable: 5 });
          await error(
            await request(
              'me/part-listings/' + row.id,
              'PATCH',
              {
                part: {
                  fitment: {
                    mode: 'VEHICLE_SPECIFIC',
                    vehicles: [{ modelId: fixture.model }],
                  },
                },
              },
              initial.version,
            ),
            409,
            'LISTING_VERSION_CONFLICT',
          );
          const responses = await Promise.all([
            request(
              'me/part-listings/' + row.id,
              'PATCH',
              { quantityAvailable: 6 },
              row.version,
            ),
            request(
              'me/part-listings/' + row.id,
              'PATCH',
              { quantityAvailable: 7 },
              row.version,
            ),
          ]);
          assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
          row = await owner(await request('me/listings/' + row.id));
          assert.ok([6, 7].includes(row.part.quantityAvailable));
        },
      );
      await t.test(
        'READY primary required; incomplete specific fitment cannot submit; submission freezes part and shared media mutations',
        async () => {
          await error(
            await request(
              'me/listings/' + row.id + '/submit',
              'POST',
              {},
              row.version,
            ),
            400,
            'LISTING_INCOMPLETE',
          );
          await seedReadyPhoto(source, row.id);
          row = await patch(row, {
            part: { fitment: { mode: 'VEHICLE_SPECIFIC', vehicles: [] } },
          });
          await error(
            await request(
              'me/listings/' + row.id + '/submit',
              'POST',
              {},
              row.version,
            ),
            400,
            'PART_INCOMPLETE',
          );
          row = await patch(row, {
            part: { fitment: { mode: 'UNIVERSAL', vehicles: [] } },
          });
          row = await owner(
            await request(
              'me/listings/' + row.id + '/submit',
              'POST',
              {},
              row.version,
            ),
          );
          assert.equal(row.status, 'PENDING_MODERATION');
          assert.equal(row.location, null);
          await error(
            await request(
              'me/part-listings/' + row.id,
              'PATCH',
              { quantityAvailable: 1 },
              row.version,
            ),
            409,
            'LISTING_INVALID_STATE',
          );
          await error(
            await request('parts/listings/' + row.id),
            404,
            'LISTING_NOT_FOUND',
          );
        },
      );
      await t.test(
        'published part list is compact, filtered, READY-primary only and preserves public privacy; cars remain separate',
        async () => {
          await source.query(
            "UPDATE listings SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1",
            [row.id],
          );
          row = await owner(await request('me/listings/' + row.id));
          const detail = await request(
            'parts/listings/' + row.id,
            'GET',
            undefined,
            undefined,
            '',
          );
          const body: Record<string, unknown> = await detail.json();
          assert.equal(detail.status, 200);
          for (const secret of ['vehicle', 'version', 'sellerId'])
            assert.equal(secret in body, false);
          assert.equal(body.location, null);
          const match = await request(
            'listings?type=PART&categoryId=' +
              PART_CATEGORY_IDS.pads +
              '&condition=NEW&currency=EUR&priceFromMinor=9007199254740993&compatibleMakeId=' +
              '10000000-0000-4000-8000-000000000001' +
              '&compatibleModelId=' +
              fixture.model,
            'GET',
            undefined,
            undefined,
            '',
          );
          const page: {
            items: { id: string; part: Record<string, unknown> }[];
          } = await match.json();
          assert.equal(match.status, 200, JSON.stringify(page));
          assert.deepEqual(
            page.items.map((item) => item.id),
            [row.id],
          );
          assert.equal(
            (page.items[0]!.part.fitment as { samples: unknown[] }).samples
              .length <= 3,
            true,
          );
          assert.equal('oemNumber' in page.items[0]!.part, true);
          for (const query of [
            'condition=USED',
            'currency=USD',
            'categoryId=' + randomUUID(),
            'brandId=' + randomUUID(),
          ]) {
            const result: { items: unknown[] } = await (
              await request('listings?type=PART&' + query)
            ).json();
            assert.equal(result.items.length, 0);
          }
          for (const [query, code] of [
            ['limit=50000', 'SEARCH_INVALID_FILTER'],
            ['priceFromMinor=1', 'SEARCH_INVALID_FILTER'],
            [
              'currency=EUR&priceFromMinor=10&priceToMinor=1',
              'VALIDATION_ERROR',
            ],
            [
              'condition=%27%3Bdrop%20table%20parts%3B--',
              'SEARCH_INVALID_FILTER',
            ],
          ])
            await error(
              await request('listings?type=PART&' + query),
              400,
              code,
            );
          const cars: { items: { id: string }[] } = await (
            await request('listings?type=VEHICLE')
          ).json();
          assert.equal(
            cars.items.some((item) => item.id === row.id),
            false,
          );
        },
      );
      await t.test(
        'specific compatibility uses model existence and UNIVERSAL matches all models; all draft/hidden states excluded',
        async () => {
          const specific = await create({
            ...input(),
            part: {
              ...input().part,
              fitment: {
                mode: 'VEHICLE_SPECIFIC',
                vehicles: [
                  { modelId: fixture.model, generationId: fixture.generation },
                ],
              },
            },
          });
          await seedReadyPhoto(source, specific.id);
          await source.query(
            "UPDATE listings SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id=$1",
            [specific.id],
          );
          const matching: { items: { id: string }[] } = await (
            await request(
              'listings?type=PART&compatibleModelId=' + fixture.model,
            )
          ).json();
          assert.ok(matching.items.some((item) => item.id === specific.id));
          const other: { items: { id: string }[] } = await (
            await request(
              'listings?type=PART&compatibleModelId=' + randomUUID(),
            )
          ).json();
          assert.equal(
            other.items.some((item) => item.id === specific.id),
            false,
          );
          assert.ok(other.items.some((item) => item.id === row.id));
          for (const status of [
            'DRAFT',
            'PENDING_MODERATION',
            'REJECTED',
            'SOLD',
            'ARCHIVED',
          ]) {
            const hidden = await create();
            await seedReadyPhoto(source, hidden.id);
            await source.query(
              'UPDATE listings SET status=$1,published_at=$2,sold_at=$3,archived_at=$4,submitted_at=$6 WHERE id=$5',
              [
                status,
                ['SOLD'].includes(status) ? new Date() : null,
                status === 'SOLD' ? new Date() : null,
                status === 'ARCHIVED' ? new Date() : null,
                hidden.id,
                status === 'PENDING_MODERATION' ? new Date() : null,
              ],
            );
          }
          const invalid = await create();
          await source.query(
            "UPDATE listings SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id=$1",
            [invalid.id],
          );
          const result: { items: { id: string }[] } = await (
            await request('listings?type=PART')
          ).json();
          assert.equal(result.items.length, 2);
          assert.equal(
            result.items.some((item) => item.id === invalid.id),
            false,
          );
        },
      );
      await t.test(
        'unified Parts search supports subtype filters, cursors, geo, facets and compact map markers',
        async () => {
          const publish = async (body: object) => {
            const value = await create(body);
            await seedReadyPhoto(source, value.id);
            await source.query(
              "UPDATE listings SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id=$1",
              [value.id],
            );
            return value.id;
          };
          const near = await publish({
            ...input(),
            part: {
              ...input().part,
              categoryId: 'a1000000-0000-4000-8000-000000000013',
              brandId: 'a2000000-0000-4000-8000-000000000002',
              name: 'Brake disc',
              condition: 'USED',
              manufacturerPartNumber: 'br-1',
              oemNumber: 'oem-1',
              fitment: {
                mode: 'VEHICLE_SPECIFIC',
                vehicles: [
                  {
                    modelId: fixture.model,
                    generationId: null,
                    yearFrom: 2010,
                    yearTo: 2020,
                  },
                ],
              },
            },
            listing: {
              ...input().listing,
              title: 'Located brake disc',
              price: { amountMinor: '10000', currency: 'EUR' },
            },
            location: {
              latitude: 52,
              longitude: 4,
              city: 'Near',
              countryCode: 'NL',
              publicPoint: { latitude: 53, longitude: 5 },
            },
          });
          const farther = await publish({
            ...input(),
            part: {
              ...input().part,
              name: 'Farther pads',
              manufacturerPartNumber: 'far-2',
              oemNumber: null,
            },
            listing: {
              ...input().listing,
              title: 'Farther pads',
              price: { amountMinor: '20000', currency: 'EUR' },
            },
            location: {
              latitude: 52.01,
              longitude: 4,
              city: 'Farther',
              countryCode: 'NL',
            },
          });
          const usd = await publish({
            ...input(),
            part: {
              ...input().part,
              name: 'USD pads',
              manufacturerPartNumber: 'usd-3',
            },
            listing: {
              ...input().listing,
              title: 'USD pads',
              price: { amountMinor: '10000', currency: 'USD' },
            },
          });
          const search = async (query: string) => {
            const response = await request('listings?type=PART&' + query);
            const value: {
              items: {
                id: string;
                type: string;
                location: {
                  publicPoint: { latitude: number; longitude: number } | null;
                  distanceMeters: number | null;
                } | null;
              }[];
              page: { hasNextPage: boolean; nextCursor: string | null };
            } = await response.json();
            assert.equal(response.status, 200, JSON.stringify(value));
            assert.ok(value.items.every((item) => item.type === 'PART'));
            return value;
          };
          for (const query of [
            'categoryId=' + PART_CATEGORY_IDS.brakes,
            'brandId=a2000000-0000-4000-8000-000000000002',
            'condition=NEW,USED',
            'oemNumber=oem-1',
            'manufacturerPartNumber=br-1',
            'partNumber=br-1',
          ])
            assert.ok((await search(query)).items.length > 0, query);
          assert.equal(
            (
              await search(
                'categoryId=' +
                  PART_CATEGORY_IDS.brakes +
                  '&includeSubcategories=false',
              )
            ).items.length,
            0,
          );
          await source.query(
            'UPDATE part_categories SET parent_id=$1 WHERE id=$2',
            [PART_CATEGORY_IDS.pads, PART_CATEGORY_IDS.brakes],
          );
          try {
            assert.ok(
              (await search('categoryId=' + PART_CATEGORY_IDS.brakes)).items
                .length > 0,
            );
          } finally {
            await source.query(
              'UPDATE part_categories SET parent_id=NULL WHERE id=$1',
              [PART_CATEGORY_IDS.brakes],
            );
          }
          assert.deepEqual(
            (await search('partNumber=BR-1')).items.map((item) => item.id),
            [near],
          );
          assert.equal((await search('partNumber=BR')).items.length, 0);
          assert.equal(
            (await search('currency=EUR&priceToMinor=20000')).items.some(
              (item) => item.id === usd,
            ),
            false,
          );
          assert.ok(
            (await search('currency=USD&priceToMinor=20000')).items.some(
              (item) => item.id === usd,
            ),
          );
          await source.query(
            'UPDATE part_categories SET is_active=false WHERE id=$1',
            ['a1000000-0000-4000-8000-000000000013'],
          );
          try {
            assert.equal((await search('partNumber=BR-1')).items.length, 0);
          } finally {
            await source.query(
              'UPDATE part_categories SET is_active=true WHERE id=$1',
              ['a1000000-0000-4000-8000-000000000013'],
            );
          }
          assert.ok(
            (
              await search(
                'compatibleModelId=' +
                  fixture.model +
                  '&compatibleGenerationId=' +
                  fixture.generation +
                  '&compatibleYear=2015&includeUniversal=false',
              )
            ).items.some((item) => item.id === near),
          );
          assert.equal(
            (
              await search(
                'compatibleModelId=' +
                  fixture.model +
                  '&compatibleYear=2025&includeUniversal=false',
              )
            ).items.some((item) => item.id === near),
            false,
          );
          const sorted = await search('currency=EUR&sort=price_asc');
          assert.deepEqual(
            sorted.items.slice(0, 2).map((item) => item.id),
            [near, farther],
          );
          const first = await search('limit=1');
          assert.ok(first.page.nextCursor);
          const second = await search(
            'limit=1&cursor=' + encodeURIComponent(first.page.nextCursor!),
          );
          assert.notEqual(first.items[0]?.id, second.items[0]?.id);
          await error(
            await request(
              'listings?type=PART&condition=USED&cursor=' +
                encodeURIComponent(first.page.nextCursor!),
            ),
            400,
            'SEARCH_CURSOR_QUERY_MISMATCH',
          );
          await error(
            await request(
              'listings?type=VEHICLE&cursor=' +
                encodeURIComponent(first.page.nextCursor!),
            ),
            400,
            'SEARCH_CURSOR_QUERY_MISMATCH',
          );
          await error(
            await request('listings?type=PART&yearFrom=2020'),
            400,
            'SEARCH_FILTER_NOT_SUPPORTED',
          );
          await error(
            await request('listings?type=PART&sort=year_desc'),
            400,
            'SEARCH_SORT_NOT_SUPPORTED',
          );
          const radius = await search(
            'lat=52&lng=4&radiusMeters=2000&sort=distance',
          );
          assert.deepEqual(
            radius.items.slice(0, 2).map((item) => item.id),
            [near, farther],
          );
          assert.deepEqual(radius.items[0]?.location?.publicPoint, {
            latitude: 53,
            longitude: 5,
          });
          assert.equal(radius.items[1]?.location?.publicPoint, null);
          assert.ok(
            radius.items.every(
              (item) =>
                item.location?.distanceMeters === 0 ||
                (item.location?.distanceMeters ?? 0) % 1000 === 0,
            ),
          );
          await source.query(
            'UPDATE listing_locations SET public_point=ST_SetSRID(ST_MakePoint(5,53),4326) WHERE listing_id=$1',
            [farther],
          );
          const map: {
            features: (
              | {
                  kind: 'LISTING';
                  listingId: string;
                  type: string;
                  publicPoint: { latitude: number; longitude: number };
                  part: { name: string };
                }
              | { kind: 'CLUSTER'; count: number }
            )[];
            truncated: boolean;
          } = await (
            await request(
              'search/listings/map?type=PART&viewport=4.9,52.9,5.1,53.1&zoom=10&limit=1',
            )
          ).json();
          assert.equal(map.features.length, 1);
          assert.equal(map.truncated, false);
          assert.equal(map.features[0]?.kind, 'CLUSTER');
          if (map.features[0]?.kind === 'CLUSTER')
            assert.equal(map.features[0].count, 2);
          assert.ok(!JSON.stringify(map).includes('52.01'));
          const facets: {
            type: string;
            facets: {
              category: { value: string; count: number }[];
              brand: { value: string; count: number }[];
              condition: { value: string; count: number }[];
            };
            semantics: string;
          } = await (
            await request('search/listings/facets?type=PART&condition=USED')
          ).json();
          assert.equal(facets.type, 'PART');
          assert.equal(facets.semantics, 'after_all_filters');
          assert.ok(
            facets.facets.category.some(
              (facet) =>
                facet.value === 'a1000000-0000-4000-8000-000000000013' &&
                facet.count >= 1,
            ),
          );
          assert.ok(
            facets.facets.condition.some(
              (facet) => facet.value === 'USED' && facet.count >= 1,
            ),
          );
        },
      );
      await t.test(
        'common seller list includes both discriminated types and filters either type; bounded queries stay independent of result size',
        async () => {
          const mixed: {
            items: { type: string; part?: { fitment: { count: number } } }[];
          } = await (await request('me/listings')).json();
          assert.ok(mixed.items.some((item) => item.type === 'PART'));
          assert.ok(mixed.items.some((item) => item.type === 'VEHICLE'));
          for (const type of ['PART', 'VEHICLE']) {
            const result: { items: { type: string }[] } = await (
              await request('me/listings?type=' + type)
            ).json();
            assert.ok(result.items.length);
            assert.ok(result.items.every((item) => item.type === type));
          }
          const queries: string[] = [];
          const original = source.logger;
          source.logger = {
            logQuery: (q) => queries.push(q),
            logQueryError: () => {},
            logQuerySlow: () => {},
            logSchemaBuild: () => {},
            logMigration: () => {},
            log: () => {},
          };
          try {
            await request('listings?type=PART&limit=1');
            const small = queries.filter((q) => q.startsWith('SELECT')).length;
            queries.length = 0;
            await request('listings?type=PART&limit=50');
            assert.equal(
              queries.filter((q) => q.startsWith('SELECT')).length,
              small,
            );
          } finally {
            source.logger = original;
          }
        },
      );
      await t.test(
        'parts reuse favorites, conversations, reports, moderation and audit on common listing ID',
        async () => {
          await source.query(
            "INSERT INTO favorites(user_id,listing_id,listing_type) VALUES ($1,$2,'PART')",
            [fixture.buyer, row.id],
          );
          await source.query(
            'INSERT INTO conversations(id,listing_id,buyer_id) VALUES ($1,$2,$3)',
            [randomUUID(), row.id, fixture.buyer],
          );
          await source.query(
            "INSERT INTO reports(id,listing_id,reporter_id,target_type,reason_code,reason) VALUES ($1,$2,$3,'LISTING','MISLEADING_INFORMATION','Incorrect part description')",
            [randomUUID(), row.id, fixture.buyer],
          );
          await source.query(
            "INSERT INTO moderation_actions(id,listing_id,moderator_id,target_type,action,reason_code,internal_note) VALUES ($1,$2,$3,'LISTING','APPROVE_LISTING','APPROVED','Reviewed part')",
            [randomUUID(), row.id, fixture.moderator],
          );
          const counts: {
            favorites: string;
            conversations: string;
            reports: string;
            moderation: string;
            audits: string;
          }[] = await source.query(
            'SELECT (SELECT count(*) FROM favorites WHERE listing_id=$1) favorites,(SELECT count(*) FROM conversations WHERE listing_id=$1) conversations,(SELECT count(*) FROM reports WHERE listing_id=$1) reports,(SELECT count(*) FROM moderation_actions WHERE listing_id=$1) moderation,(SELECT count(*) FROM audit_logs WHERE target_id=$1) audits',
            [row.id],
          );
          for (const value of Object.values(counts[0]!))
            assert.ok(Number(value) > 0);
        },
      );
      await t.test(
        'part mark-sold closes remaining stock, preserves SOLD detail and archive removes public visibility',
        async () => {
          row = await owner(
            await request(
              'me/listings/' + row.id + '/mark-sold',
              'POST',
              {},
              row.version,
            ),
          );
          assert.equal(row.status, 'SOLD');
          assert.equal(row.part.quantityAvailable, 0);
          assert.equal((await request('parts/listings/' + row.id)).status, 200);
          const current: { items: { id: string }[] } = await (
            await request('listings?type=PART')
          ).json();
          assert.equal(
            current.items.some((item) => item.id === row.id),
            false,
          );
          row = await owner(
            await request(
              'me/listings/' + row.id + '/archive',
              'POST',
              {},
              row.version,
            ),
          );
          assert.equal(row.status, 'ARCHIVED');
          await error(
            await request('parts/listings/' + row.id),
            404,
            'LISTING_NOT_FOUND',
          );
        },
      );
      await t.test(
        'shared optional location keeps exact coordinates on owner only and never invents a public point',
        async () => {
          const draft = await create({
            ...input(),
            location: {
              latitude: 52.123456,
              longitude: 4.123456,
              city: 'Amsterdam',
              region: 'NH',
              countryCode: 'NL',
            },
          });
          assert.equal(draft.location?.exactPoint.latitude, 52.123456);
          assert.equal(draft.location?.publicPoint, null);
          await seedReadyPhoto(source, draft.id);
          await source.query(
            "UPDATE listings SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id=$1",
            [draft.id],
          );
          const response = await request('parts/listings/' + draft.id);
          const raw = await response.text();
          assert.equal(response.status, 200);
          for (const secret of [
            'exactPoint',
            '52.123456',
            '4.123456',
            'storageKey',
            'version',
          ])
            assert.equal(raw.includes(secret), false);
          const body: { location: { publicPoint: unknown } } = JSON.parse(raw);
          assert.equal(body.location.publicPoint, null);
          await source.query(
            "UPDATE listings SET status='ARCHIVED',archived_at=CURRENT_TIMESTAMP WHERE id=$1",
            [draft.id],
          );
        },
      );
      await t.test(
        'part submit/archive race respects one shared CAS winner and leaves complete product/media association',
        async () => {
          const draft = await create();
          await seedReadyPhoto(source, draft.id);
          const results = await Promise.all([
            request(
              'me/listings/' + draft.id + '/submit',
              'POST',
              {},
              draft.version,
            ),
            request(
              'me/listings/' + draft.id + '/archive',
              'POST',
              {},
              draft.version,
            ),
          ]);
          assert.deepEqual(
            results.map((result) => result.status).sort(),
            [200, 409],
          );
          const current = await owner(await request('me/listings/' + draft.id));
          assert.equal(current.version, draft.version + 1);
          assert.ok(
            ['PENDING_MODERATION', 'ARCHIVED'].includes(current.status),
          );
          assert.equal(current.part.quantityAvailable, 3);
          assert.equal(current.media.length, 1);
        },
      );
      await t.test(
        'database prevents wrong or duplicate subtypes and duplicate null fitment; category cycle changes are transactional',
        async () => {
          const link: { part_id: string }[] = await source.query(
            'SELECT part_id FROM part_listings WHERE listing_id=$1',
            [row.id],
          );
          await assert.rejects(
            source.query(
              "INSERT INTO vehicle_listings(listing_id,type,vehicle_id) VALUES ($1,'VEHICLE',$2)",
              [row.id, fixture.vehicles[0]],
            ),
          );
          await assert.rejects(
            source.query(
              'INSERT INTO part_listings(listing_id,part_id) VALUES ($1,$2)',
              [fixture.listings[0], link[0]!.part_id],
            ),
          );
          const part = await source.manager.findOneByOrFail(Part, {
            id: link[0]!.part_id,
          });
          await source.query(
            "UPDATE parts SET fitment_mode='VEHICLE_SPECIFIC' WHERE id=$1",
            [part.id],
          );
          await source.query(
            'INSERT INTO part_fitments(part_id,model_id) VALUES ($1,$2)',
            [part.id, fixture.model],
          );
          await assert.rejects(
            source.query(
              'INSERT INTO part_fitments(part_id,model_id,generation_id,year_from,year_to) VALUES ($1,$2,NULL,NULL,NULL)',
              [part.id, fixture.model],
            ),
          );
          await assert.rejects(
            source.transaction((manager) =>
              server
                .get(PartCatalog)
                .setParent(
                  PART_CATEGORY_IDS.brakes,
                  PART_CATEGORY_IDS.pads,
                  manager,
                ),
            ),
          );
          const first = randomUUID(),
            second = randomUUID();
          await source.manager.insert(PartCategory, [
            { id: first, parentId: null, name: 'Cycle A', slug: 'cycle-a' },
            { id: second, parentId: null, name: 'Cycle B', slug: 'cycle-b' },
          ]);
          const outcomes = await Promise.allSettled([
            source.transaction((manager) =>
              server.get(PartCatalog).setParent(first, second, manager),
            ),
            source.transaction((manager) =>
              server.get(PartCatalog).setParent(second, first, manager),
            ),
          ]);
          assert.equal(
            outcomes.filter((result) => result.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            outcomes.filter((result) => result.status === 'rejected').length,
            1,
          );
          const diff = await source.driver.createSchemaBuilder().log();
          assert.equal(diff.upQueries.length, 0);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await assert.rejects(source.undoLastMigration(), /Rollback blocked/);
          assert.equal((await source.runMigrations()).length, 5);
        },
      );
    } finally {
      await server.close();
      await db.close();
    }
  },
);
