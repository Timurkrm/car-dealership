import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { RequestRateGuard } from '../../src/platform/http/request-rate.guard';
import { AuthTokens } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { OutboxRecords, OutboxWriter } from '../../src/modules/outbox';
import { OutboxEventProcessor } from '../../src/engagement/outbox-event-processor';
import {
  seedPartCatalog,
  PART_BRAND_IDS,
  PART_CATEGORY_IDS,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';
import { createSchemaDatabase } from '../support/schema-database';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';
import { seedReadyPhoto } from '../support/ready-media-fixture';

test(
  'engagement HTTP and durable outbox fanout for Cars and Parts',
  { timeout: 120000 },
  async (t) => {
    const database = await createSchemaDatabase();
    const { source } = database;
    let app: INestApplication | undefined;
    try {
      const base = loadConfig('test');
      const config = {
        ...base,
        engagement: { ...base.engagement, savedSearchMaxPerUser: 4 },
        database: { ...base.database, name: String(source.options.database) },
        swagger: true,
      };
      await source.runMigrations();
      await seedMarketplaceFixture(source);
      await source.query(
        'UPDATE users SET email_verified_at=CURRENT_TIMESTAMP',
      );
      await source.transaction(seedPartCatalog);
      await source.query(
        "UPDATE listings SET description='Public engagement fixture' WHERE id=ANY($1)",
        [fixture.listings],
      );
      await source.query('DELETE FROM listing_media');
      for (const id of fixture.listings) await seedReadyPhoto(source, id);

      const partId = randomUUID(),
        partListingId = randomUUID();
      await source.query(
        "INSERT INTO parts(id,category_id,brand_id,name,condition,manufacturer_part_number,oem_number,fitment_mode) VALUES ($1,$2,$3,'Brake pads','NEW','AB-12','OE-10','UNIVERSAL')",
        [partId, PART_CATEGORY_IDS.pads, PART_BRAND_IDS.bosch],
      );
      await source.query(
        "INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status,published_at) VALUES ($1,$2,'PART','Brake pads','Public part','15000','EUR','PUBLISHED',CURRENT_TIMESTAMP)",
        [partListingId, fixture.seller],
      );
      await source.query(
        'INSERT INTO part_listings(listing_id,part_id,quantity_available) VALUES ($1,$2,3)',
        [partListingId, partId],
      );
      await seedReadyPhoto(source, partListingId);

      const buyerSession = randomUUID(),
        sellerSession = randomUUID();
      for (const [user, session] of [
        [fixture.buyer, buyerSession],
        [fixture.seller, sellerSession],
      ])
        await source.query(
          'INSERT INTO user_sessions(id,user_id,expires_at,last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
          [session, user, '2100-01-01T00:00:00Z'],
        );

      const module = await Test.createTestingModule({
        imports: [AppModule.register(config)],
      })
        .overrideProvider(DatabaseConnection)
        .useValue({ source, check: async () => source.query('SELECT 1') })
        .overrideProvider(ObjectStorage)
        .useValue({
          readUrl: async () => 'https://processed.example.test/thumbnail.webp',
        })
        .overrideGuard(RequestRateGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = module.createNestApplication({ bodyParser: false, logger: false });
      configureApp(app, config);
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl(),
        signer = app.get(AuthTokens);
      const buyer = await signer.issue({
        userId: fixture.buyer,
        sessionId: buyerSession,
        roles: ['USER'],
      });
      const seller = await signer.issue({
        userId: fixture.seller,
        sessionId: sellerSession,
        roles: ['USER'],
      });
      const request = (
        path: string,
        token: string,
        method = 'GET',
        body?: object,
      ) =>
        fetch(`${origin}/api/v1/${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

      await t.test(
        'favorites are idempotent, mixed, cursor bounded and hidden rows become tombstones',
        async () => {
          for (const listingId of [
            fixture.listings[0],
            fixture.listings[1],
            fixture.listings[2],
            partListingId,
          ]) {
            const repeated = await Promise.all([
              request(`me/favorites/${listingId}`, buyer, 'PUT'),
              request(`me/favorites/${listingId}`, buyer, 'PUT'),
            ]);
            assert.deepEqual(
              repeated.map((row) => row.status),
              [200, 200],
            );
          }
          const vehicle = await request(
            'me/favorites?type=VEHICLE&limit=1',
            buyer,
          );
          assert.equal(vehicle.status, 200);
          const first = (await vehicle.json()) as {
            items: { kind: string }[];
            page: { nextCursor: string | null };
          };
          assert.equal(first.items.length, 1);
          assert.equal(first.items[0]?.kind, 'VEHICLE');
          assert.ok(first.page.nextCursor);
          const part = (await (
            await request('me/favorites?type=PART', buyer)
          ).json()) as { items: { kind: string }[] };
          assert.equal(part.items[0]?.kind, 'PART');
          await source.query(
            "UPDATE listings SET status='ARCHIVED', archived_at=CURRENT_TIMESTAMP WHERE id=$1",
            [fixture.listings[0]],
          );
          const hidden = (await (
            await request('me/favorites', buyer)
          ).json()) as { items: Record<string, unknown>[] };
          const tombstone = hidden.items.find(
            (row) => row.listingId === fixture.listings[0],
          );
          assert.equal(tombstone?.kind, 'UNAVAILABLE');
          assert.equal('title' in (tombstone ?? {}), false);
          assert.equal(
            (
              await request(
                `me/favorites/${fixture.listings[0]}`,
                buyer,
                'DELETE',
              )
            ).status,
            204,
          );
          assert.equal(
            (
              await request(
                `me/favorites/${fixture.listings[0]}`,
                buyer,
                'DELETE',
              )
            ).status,
            204,
          );
        },
      );

      await t.test(
        'saved searches canonicalize, dedupe, reject Near Me and enforce ownership',
        async () => {
          const carBody = {
            name: 'BMW petrol',
            type: 'VEHICLE',
            filters: {
              makeId: '10000000-0000-4000-8000-000000000001',
              fuelType: 'PETROL,DIESEL',
            },
            notificationsEnabled: true,
          };
          const created = await request(
            'me/saved-searches',
            buyer,
            'POST',
            carBody,
          );
          assert.equal(created.status, 201, await created.clone().text());
          const saved = (await created.json()) as {
            id: string;
            filters: Record<string, string>;
          };
          assert.equal(saved.filters.fuelType, 'DIESEL,PETROL');
          assert.equal(
            (
              await request('me/saved-searches', buyer, 'POST', {
                ...carBody,
                filters: {
                  fuelType: 'DIESEL,PETROL',
                  makeId: carBody.filters.makeId,
                },
              })
            ).status,
            409,
          );
          const near = await request('me/saved-searches', buyer, 'POST', {
            name: 'Private origin',
            type: 'VEHICLE',
            filters: { lat: '52', lng: '4' },
            notificationsEnabled: true,
          });
          assert.equal(near.status, 400);
          assert.equal(
            (await near.json()).code,
            'SAVED_SEARCH_LOCATION_NOT_SAVABLE',
          );
          assert.equal(
            (
              await request(`me/saved-searches/${saved.id}`, seller, 'PATCH', {
                name: 'stolen',
              })
            ).status,
            404,
          );
          const partSaved = await request('me/saved-searches', buyer, 'POST', {
            name: 'Pads',
            type: 'PART',
            filters: {
              categoryId: PART_CATEGORY_IDS.brakes,
              includeSubcategories: 'true',
              brandId: PART_BRAND_IDS.bosch,
              compatibleModelId: fixture.model,
              includeUniversal: 'true',
            },
            notificationsEnabled: true,
          });
          assert.equal(partSaved.status, 201, await partSaved.clone().text());
          const concurrent = await Promise.all([
            request('me/saved-searches', buyer, 'POST', {
              name: 'Blue cars',
              type: 'VEHICLE',
              filters: { color: 'BLUE' },
              notificationsEnabled: true,
            }),
            request('me/saved-searches', buyer, 'POST', {
              name: 'Black cars',
              type: 'VEHICLE',
              filters: { color: 'BLACK' },
              notificationsEnabled: true,
            }),
          ]);
          assert.deepEqual(
            concurrent.map((row) => row.status).sort(),
            [201, 409],
          );
          const createdAtLimit = concurrent.find((row) => row.status === 201);
          assert.ok(createdAtLimit);
          const createdAtLimitBody = (await createdAtLimit.json()) as {
            id: string;
          };
          assert.equal(
            (
              await request(
                `me/saved-searches/${createdAtLimitBody.id}`,
                buyer,
                'DELETE',
              )
            ).status,
            204,
          );
        },
      );

      await t.test(
        'outbox rollback, concurrent claim, stale lease and poison handling are durable',
        async () => {
          const writer = app?.get(OutboxWriter),
            records = app?.get(OutboxRecords);
          assert.ok(writer && records);
          const rolledBack = randomUUID();
          await assert.rejects(() =>
            source.transaction(async (manager) => {
              await writer.listingLifecycle(
                'LISTING_ARCHIVED',
                {
                  schemaVersion: 1,
                  listingId: rolledBack,
                  listingType: 'VEHICLE',
                  sellerId: fixture.seller,
                  previousStatus: 'PUBLISHED',
                  nextStatus: 'ARCHIVED',
                },
                manager,
              );
              throw new Error('rollback');
            }),
          );
          assert.equal(
            Number(
              (
                await source.query(
                  'SELECT count(*) count FROM outbox_events WHERE aggregate_id=$1',
                  [rolledBack],
                )
              )[0].count,
            ),
            0,
          );

          const staleId = randomUUID(),
            poisonId = randomUUID();
          const payload = {
            schemaVersion: 1,
            listingId: fixture.listings[2],
            listingType: 'VEHICLE',
            sellerId: fixture.seller,
            previousStatus: 'PUBLISHED',
            nextStatus: 'ARCHIVED',
          };
          await source.query(
            "INSERT INTO outbox_events(id,type,aggregate_type,aggregate_id,payload,occurred_at,status,attempts,available_at,locked_at) VALUES ($1,'LISTING_ARCHIVED','LISTING',$2,$3,CURRENT_TIMESTAMP,'PROCESSING',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP-INTERVAL '10 minutes'),($4,'LISTING_ARCHIVED','LISTING',$2,'{}',CURRENT_TIMESTAMP,'PENDING',0,CURRENT_TIMESTAMP,NULL)",
            [staleId, fixture.listings[2], payload, poisonId],
          );
          const [left, right] = await Promise.all([
            records.claim(),
            records.claim(),
          ]);
          const ids = [...left, ...right].map((event) => event.id);
          assert.equal(new Set(ids).size, ids.length);
          assert.ok(ids.includes(staleId));
          const poison = (
            await source.query(
              'SELECT status,last_error_code FROM outbox_events WHERE id=$1',
              [poisonId],
            )
          )[0];
          assert.deepEqual(poison, {
            status: 'FAILED',
            last_error_code: 'OUTBOX_INVALID_PAYLOAD',
          });
          for (const event of [...left, ...right])
            await records.fail(event, 'TEST_TRANSIENT');
          assert.equal(
            (
              await source.query(
                'SELECT status FROM outbox_events WHERE id=$1',
                [staleId],
              )
            )[0].status,
            'RETRY',
          );
          assert.equal(await records.recoverFailed(poisonId), 1);
        },
      );

      await t.test(
        'publication matching and favorite status fanout are idempotent and private',
        async () => {
          await source.query(
            "UPDATE listings SET status='PUBLISHED', archived_at=NULL WHERE id=$1",
            [fixture.listings[0]],
          );
          const writer = app?.get(OutboxWriter),
            records = app?.get(OutboxRecords),
            processor = app?.get(OutboxEventProcessor);
          assert.ok(writer && records && processor);
          const secondMatch = await request(
            'me/saved-searches',
            buyer,
            'POST',
            {
              name: 'Recent cars',
              type: 'VEHICLE',
              filters: { yearFrom: '2020' },
              notificationsEnabled: true,
            },
          );
          assert.equal(
            secondMatch.status,
            201,
            await secondMatch.clone().text(),
          );
          assert.equal(
            (
              await request('me/saved-searches', seller, 'POST', {
                name: 'Seller own cars',
                type: 'VEHICLE',
                filters: {
                  makeId: '10000000-0000-4000-8000-000000000001',
                },
                notificationsEnabled: true,
              })
            ).status,
            201,
          );
          const publishId = await source.transaction((manager) =>
            writer.listingLifecycle(
              'LISTING_PUBLISHED',
              {
                schemaVersion: 1,
                listingId: fixture.listings[0],
                listingType: 'VEHICLE',
                sellerId: fixture.seller,
                previousStatus: 'PENDING_MODERATION',
                nextStatus: 'PUBLISHED',
              },
              manager,
            ),
          );
          const partPublishId = await source.transaction((manager) =>
            writer.listingLifecycle(
              'LISTING_PUBLISHED',
              {
                schemaVersion: 1,
                listingId: partListingId,
                listingType: 'PART',
                sellerId: fixture.seller,
                previousStatus: 'PENDING_MODERATION',
                nextStatus: 'PUBLISHED',
              },
              manager,
            ),
          );
          const claimed = await records.claim();
          for (const event of claimed) {
            await processor.process(event);
            await processor.process(event);
          }
          const matches: { type: string; source_event_id: string }[] =
            await source.query(
              'SELECT type,source_event_id FROM notifications WHERE user_id=$1 AND source_event_id IN ($2,$3)',
              [fixture.buyer, publishId, partPublishId],
            );
          assert.deepEqual(
            new Set(matches.map((row) => row.source_event_id)),
            new Set([publishId, partPublishId]),
          );
          assert.equal(matches.length, 2);
          assert.equal(JSON.stringify(matches).includes('point'), false);
          const sellerMatches: { count: string }[] = await source.query(
            'SELECT count(*) FROM notifications WHERE user_id=$1 AND source_event_id IN ($2,$3)',
            [fixture.seller, publishId, partPublishId],
          );
          assert.equal(sellerMatches[0]?.count, '0');

          const soldId = await source.transaction(async (manager) => {
            await manager.query(
              "UPDATE listings SET status='SOLD', sold_at=CURRENT_TIMESTAMP WHERE id=$1",
              [partListingId],
            );
            return writer.listingLifecycle(
              'LISTING_MARKED_SOLD',
              {
                schemaVersion: 1,
                listingId: partListingId,
                listingType: 'PART',
                sellerId: fixture.seller,
                previousStatus: 'PUBLISHED',
                nextStatus: 'SOLD',
              },
              manager,
            );
          });
          for (const event of await records.claim())
            await processor.process(event);
          const statusRows: { payload: Record<string, unknown> }[] =
            await source.query(
              'SELECT payload FROM notifications WHERE source_event_id=$1',
              [soldId],
            );
          assert.equal(statusRows.length, 1);
          assert.equal(statusRows[0]?.payload.status, 'SOLD');
          assert.equal(JSON.stringify(statusRows).includes('exact'), false);

          const unavailableEvents: string[] = [];
          for (const [type, listingId] of [
            ['LISTING_ARCHIVED', fixture.listings[1]],
            ['LISTING_REMOVED_BY_MODERATOR', fixture.listings[2]],
          ] as const)
            unavailableEvents.push(
              await source.transaction(async (manager) => {
                await manager.query(
                  "UPDATE listings SET status='ARCHIVED', archived_at=CURRENT_TIMESTAMP WHERE id=$1",
                  [listingId],
                );
                return writer.listingLifecycle(
                  type,
                  {
                    schemaVersion: 1,
                    listingId,
                    listingType: 'VEHICLE',
                    sellerId: fixture.seller,
                    previousStatus: 'PUBLISHED',
                    nextStatus: 'ARCHIVED',
                  },
                  manager,
                );
              }),
            );
          for (const event of await records.claim())
            await processor.process(event);
          const unavailable: { source_event_id: string; payload: unknown }[] =
            await source.query(
              'SELECT source_event_id,payload FROM notifications WHERE user_id=$1 AND source_event_id=ANY($2) ORDER BY source_event_id',
              [fixture.buyer, unavailableEvents],
            );
          assert.equal(unavailable.length, 2);
          assert.ok(
            unavailable.every(
              (row) =>
                (row.payload as { status?: string }).status === 'UNAVAILABLE',
            ),
          );
          assert.equal(
            /reason|report|moderator|exact/i.test(JSON.stringify(unavailable)),
            false,
          );
        },
      );

      await t.test(
        'notification center cursor, unread, owner read and cutoff operations',
        async () => {
          const unread = (await (
            await request('me/notifications/unread-count', buyer)
          ).json()) as { count: number };
          assert.ok(unread.count >= 3);
          const response = await request(
            'me/notifications?limit=1&unreadOnly=true',
            buyer,
          );
          assert.equal(response.status, 200);
          const timeline = (await response.json()) as {
            items: {
              id: string;
              readAt: string | null;
              content: Record<string, unknown>;
            }[];
            page: { nextCursor: string | null };
          };
          assert.equal(timeline.items.length, 1);
          assert.ok(timeline.page.nextCursor);
          const notificationId = timeline.items[0]?.id;
          assert.ok(notificationId);
          assert.equal(
            (
              await request(
                `me/notifications/${notificationId}/read`,
                seller,
                'POST',
                {},
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                `me/notifications/${notificationId}/read`,
                buyer,
                'POST',
                {},
              )
            ).status,
            200,
          );
          assert.equal(
            (
              await request(
                `me/notifications/${notificationId}/read`,
                buyer,
                'POST',
                {},
              )
            ).status,
            200,
          );
          assert.equal(
            (await request('me/notifications/read-all', buyer, 'POST', {}))
              .status,
            200,
          );
          assert.equal(
            (
              (await (
                await request('me/notifications/unread-count', buyer)
              ).json()) as { count: number }
            ).count,
            0,
          );
          await source.query(
            "INSERT INTO notifications(user_id,type,payload) VALUES ($1,'ACCOUNT_STATUS_CHANGED',$2)",
            [
              fixture.buyer,
              {
                schemaVersion: 1,
                accountStatus: 'ACTIVE',
                reasonCode: 'AFTER_CUTOFF',
              },
            ],
          );
          assert.equal(
            (
              (await (
                await request('me/notifications/unread-count', buyer)
              ).json()) as { count: number }
            ).count,
            1,
          );
        },
      );
      await t.test(
        'OpenAPI publishes protected engagement contracts',
        async () => {
          const response = await fetch(`${origin}/api/docs-json`);
          assert.equal(response.status, 200);
          const document = (await response.json()) as {
            paths?: Record<string, Record<string, unknown>>;
            components?: { schemas?: Record<string, unknown> };
          };
          for (const [path, methods] of [
            ['/api/v1/me/favorites', ['get']],
            ['/api/v1/me/favorites/{listingId}', ['put', 'delete']],
            ['/api/v1/me/saved-searches', ['get', 'post']],
            ['/api/v1/me/saved-searches/{id}', ['patch', 'delete']],
            ['/api/v1/me/notifications', ['get']],
            ['/api/v1/me/notifications/unread-count', ['get']],
            ['/api/v1/me/notifications/read-all', ['post']],
            ['/api/v1/me/notifications/{id}/read', ['post']],
          ] as const) {
            const route = document.paths?.[path];
            assert.ok(route, path);
            for (const method of methods)
              assert.ok(route[method], `${method} ${path}`);
          }
          for (const schema of [
            'FavoriteListResponse',
            'SavedSearchResponse',
            'NotificationListResponse',
          ])
            assert.ok(document.components?.schemas?.[schema], schema);
        },
      );
    } finally {
      await app?.close();
      await database.close();
    }
  },
);
