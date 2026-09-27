import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import sharp from 'sharp';
import { MediaWorkerApplication } from '../../src/media-worker.application';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import {
  ObjectStorage,
  StorageFailure,
} from '../../src/platform/storage/object-storage';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import type { LogFields } from '../../src/platform/logging/structured-logger';
import type { LogLevel } from '../../src/config/config';
import { RequestRateGuard } from '../../src/platform/http/request-rate.guard';
import { AuthTokens } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { MediaWorker } from '../../src/modules/media';
import { MediaProcessor } from '../../src/modules/media/application/media-processor';
import { MediaCleanup } from '../../src/modules/media/application/media-cleanup';
import { MediaProcessingQueue } from '../../src/modules/media/infrastructure/queue/media-queue';
import { ListingMedia } from '../../src/modules/media/infrastructure/persistence/listing-media.entity';
import { MediaVariant } from '../../src/modules/media/infrastructure/persistence/media-variant.entity';
import {
  InitializeMediaResponse,
  MediaListResponse,
} from '../../src/modules/media/http/media.dto';
import { OwnerListingResponse } from '../../src/modules/listings/http/listing.dto';
import { OwnerPartListingResponse } from '../../src/modules/listings/http/part-listing.dto';
import {
  seedPartCatalog,
  PART_CATEGORY_IDS,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';
import { createSchemaDatabase } from '../support/schema-database';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';
class CaptureLogger extends StructuredLogger {
  readonly entries: string[] = [];
  override event(level: LogLevel, message: string, fields: LogFields = {}) {
    this.entries.push(JSON.stringify({ level, message, ...fields }));
  }
}
class ControlledStorage extends ObjectStorage {
  failReads = 0;
  failDeletes = 0;
  beforePut?: () => Promise<void>;
  override async readBounded(key: string, max: number, etag: string) {
    if (this.failReads > 0) {
      this.failReads--;
      throw new StorageFailure();
    }
    return super.readBounded(key, max, etag);
  }
  override async putVariant(key: string, bytes: Buffer) {
    await this.beforePut?.();
    return super.putVariant(key, bytes);
  }
  override async delete(key: string) {
    if (this.failDeletes > 0) {
      this.failDeletes--;
      throw new StorageFailure();
    }
    return super.delete(key);
  }
}
test(
  'media workflows against owned PostgreSQL, real MinIO and real BullMQ/Redis',
  { timeout: 180000 },
  async (t) => {
    const database = await createSchemaDatabase(),
      source = database.source,
      base = loadConfig('test');
    const config = {
      ...base,
      swagger: true,
      database: { ...base.database, name: String(source.options.database) },
      media: {
        ...base.media,
        maxImages: 3,
        maxFileSize: 10240,
        maxWidth: 100,
        maxHeight: 100,
        maxPixels: 8000,
      },
    };
    const logger = new CaptureLogger(config),
      storage = new ControlledStorage(config);
    await source.runMigrations();
    await seedMarketplaceFixture(source);
    await source.transaction(seedPartCatalog);
    await source.query('UPDATE users SET email_verified_at=CURRENT_TIMESTAMP');
    await source.query(
      'UPDATE user_sessions SET last_used_at=CURRENT_TIMESTAMP',
    );
    const buyerSession = randomUUID();
    await source.query(
      'INSERT INTO user_sessions(id,user_id,expires_at,last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
      [buyerSession, fixture.buyer, '2100-01-01T00:00:00Z'],
    );
    const module = await Test.createTestingModule({
      imports: [MediaWorkerApplication.register(config)],
    })
      .overrideProvider(DatabaseConnection)
      .useValue({ source })
      .overrideProvider(ObjectStorage)
      .useValue(storage)
      .overrideProvider(StructuredLogger)
      .useValue(logger)
      .overrideGuard(RequestRateGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication({
      bodyParser: false,
      logger: false,
    });
    configureApp(app, config);
    const queue = app.get(MediaProcessingQueue),
      processor = app.get(MediaProcessor),
      cleanup = app.get(MediaCleanup);
    const worker = app.get(MediaWorker);
    let origin = '',
      access = '',
      foreign = '';
    const request = (
      path: string,
      method = 'GET',
      body?: object,
      token = access,
      version?: number,
    ) =>
      fetch(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(version ? { 'if-match': `"${version}"` } : {}),
          'x-request-id': 'media-integration',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    async function json<T extends object>(
      response: Response,
      type: new () => T,
      status = 200,
    ): Promise<T> {
      const value: unknown = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      return plainToInstance(type, value);
    }
    async function code(response: Response, status: number, expected: string) {
      const value: unknown = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      assert.ok(value && typeof value === 'object' && 'code' in value);
      assert.equal(value.code, expected);
    }
    const path = (id: string, tail = '') => `me/listings/${id}/media${tail}`;
    async function draft() {
      return json(
        await request('listings', 'POST', {
          vehicle: {
            modelId: fixture.model,
            year: 2022,
            mileageKm: 100,
            bodyType: 'SEDAN',
            fuelType: 'PETROL',
            transmission: 'AUTOMATIC',
            driveType: 'RWD',
            condition: 'USED',
          },
          listing: {
            title: 'Photo integration',
            description: 'Synthetic test description',
            price: { amountMinor: '100000', currency: 'EUR' },
          },
          location: {
            latitude: 52.36761234,
            longitude: 4.90411234,
            city: 'Amsterdam',
            countryCode: 'NL',
          },
        }),
        OwnerListingResponse,
        201,
      );
    }
    const photoBytes = await sharp({
      create: { width: 60, height: 40, channels: 3, background: '#345678' },
    })
      .png()
      .toBuffer();
    const initialize = (
      id: string,
      size = photoBytes.length,
      type = 'image/jpeg',
      token = access,
    ) =>
      request(
        path(id, '/uploads'),
        'POST',
        {
          filename: '../../private/car.jpg',
          contentType: type,
          sizeBytes: size,
        },
        token,
      ).then((response) => json(response, InitializeMediaResponse, 201));
    async function upload(id: string, bytes = photoBytes, type = 'image/jpeg') {
      const intent = await initialize(id, bytes.length, type);
      const result = await fetch(intent.upload.url, {
        method: 'PUT',
        headers: { 'content-type': type },
        body: new Uint8Array(bytes),
      });
      assert.equal(result.status, 200, 'real direct MinIO PUT must succeed');
      return intent;
    }
    const complete = (id: string, media: string) =>
      request(path(id, `/${media}/complete`), 'POST', {}).then((response) =>
        json(response, MediaListResponse),
      );
    async function ready(id: string, bytes = photoBytes) {
      const intent = await upload(id, bytes);
      await complete(id, intent.mediaId);
      await processor.process(intent.mediaId);
      const row = await source.manager.findOneByOrFail(ListingMedia, {
        id: intent.mediaId,
      });
      assert.equal(row.status, 'READY');
      return intent;
    }
    async function terminal(id: string) {
      for (let index = 0; index < 150; index++) {
        const row = await source.manager.findOneByOrFail(ListingMedia, { id });
        if (['READY', 'FAILED'].includes(row.status)) return row;
        await delay(100);
      }
      assert.fail('Worker did not reach terminal state within deadline');
    }
    try {
      await app.listen(0, '127.0.0.1');
      origin = await app.getUrl();
      const tokens = app.get(AuthTokens);
      access = await tokens.issue({
        userId: fixture.seller,
        sessionId: fixture.session,
        roles: ['USER'],
      });
      foreign = await tokens.issue({
        userId: fixture.buyer,
        sessionId: buyerSession,
        roles: ['USER'],
      });
      await queue.getQueue().pause();
      await t.test(
        'PART uses real shared upload/worker/primary/submit pipeline without exact location',
        async () => {
          const listing = await json(
            await request('parts/listings', 'POST', {
              listing: {
                title: 'Universal brake accessory',
                description: 'Synthetic part media fixture',
                price: { amountMinor: '10000', currency: 'EUR' },
              },
              part: {
                categoryId: PART_CATEGORY_IDS.brakes,
                name: 'Brake accessory',
                condition: 'NEW',
                fitment: { mode: 'UNIVERSAL', vehicles: [] },
              },
            }),
            OwnerPartListingResponse,
            201,
          );
          assert.equal(listing.type, 'PART');
          assert.equal(listing.location, null);
          await code(
            await request(
              'me/listings/' + listing.id + '/submit',
              'POST',
              {},
              access,
              listing.version,
            ),
            400,
            'LISTING_INCOMPLETE',
          );
          await code(
            await request(
              path(listing.id, '/uploads'),
              'POST',
              { contentType: 'image/jpeg', sizeBytes: photoBytes.length },
              foreign,
            ),
            404,
            'LISTING_NOT_FOUND',
          );
          const intent = await upload(listing.id);
          await complete(listing.id, intent.mediaId);
          await queue.getQueue().resume();
          const processed = await terminal(intent.mediaId);
          assert.equal(processed.status, 'READY');
          assert.equal(processed.isPrimary, true);
          assert.equal(
            await source.manager.countBy(MediaVariant, {
              mediaId: intent.mediaId,
            }),
            3,
          );
          const submitted = await json(
            await request(
              'me/listings/' + listing.id + '/submit',
              'POST',
              {},
              access,
              listing.version,
            ),
            OwnerPartListingResponse,
          );
          assert.equal(submitted.status, 'PENDING_MODERATION');
          assert.equal(submitted.location, null);
          await code(
            await request(path(listing.id, '/uploads'), 'POST', {
              contentType: 'image/jpeg',
              sizeBytes: photoBytes.length,
            }),
            409,
            'LISTING_MEDIA_LOCKED',
          );
          await queue.getQueue().pause();
        },
      );
      await t.test(
        'ownership, nested media association, authentication and malformed UUIDs prevent IDOR',
        async () => {
          const listing = await draft(),
            other = await draft(),
            intent = await initialize(listing.id);
          await code(
            await request(
              path(listing.id, '/uploads'),
              'POST',
              { contentType: 'image/jpeg', sizeBytes: 100 },
              '',
            ),
            401,
            'AUTHENTICATION_REQUIRED',
          );
          await code(
            await request(
              path(listing.id, '/uploads'),
              'POST',
              { contentType: 'image/jpeg', sizeBytes: 100 },
              foreign,
            ),
            404,
            'LISTING_NOT_FOUND',
          );
          for (const [method, tail, body] of [
            ['POST', `/${intent.mediaId}/complete`, {}],
            ['PUT', '/order', { mediaIds: [intent.mediaId] }],
            ['PUT', `/${intent.mediaId}/primary`, {}],
            ['DELETE', `/${intent.mediaId}`, {}],
          ] as const)
            await code(
              await request(path(listing.id, tail), method, body, foreign),
              404,
              'LISTING_NOT_FOUND',
            );
          await code(
            await request(
              path(other.id, `/${intent.mediaId}/complete`),
              'POST',
              {},
            ),
            404,
            'MEDIA_NOT_FOUND',
          );
          await code(
            await request(path(listing.id, '/bad-id/complete'), 'POST', {}),
            400,
            'BAD_REQUEST',
          );
        },
      );
      await t.test(
        'DRAFT/REJECTED are editable; every mutation is denied in moderation/published/sold/archived states',
        async () => {
          for (const status of [
            'DRAFT',
            'REJECTED',
            'PENDING_MODERATION',
            'PUBLISHED',
            'SOLD',
            'ARCHIVED',
          ]) {
            const listing = await draft(),
              intent = await initialize(listing.id);
            await source.query(
              'UPDATE listings SET status=$2,submitted_at=NOW(),published_at=NOW(),sold_at=NOW(),archived_at=NOW() WHERE id=$1',
              [listing.id, status],
            );
            if (status === 'DRAFT' || status === 'REJECTED') {
              await initialize(listing.id);
              continue;
            }
            for (const [method, tail, body] of [
              [
                'POST',
                '/uploads',
                { contentType: 'image/jpeg', sizeBytes: 100 },
              ],
              ['POST', `/${intent.mediaId}/complete`, {}],
              ['PUT', '/order', { mediaIds: [intent.mediaId] }],
              ['PUT', `/${intent.mediaId}/primary`, {}],
              ['DELETE', `/${intent.mediaId}`, {}],
            ] as const)
              await code(
                await request(path(listing.id, tail), method, body),
                409,
                'LISTING_MEDIA_LOCKED',
              );
          }
        },
      );
      await t.test(
        'declared size/type, unexpected fields, missing object and expiry are validated safely',
        async () => {
          const listing = await draft();
          await code(
            await request(path(listing.id, '/uploads'), 'POST', {
              contentType: 'image/jpeg',
              sizeBytes: 10241,
            }),
            400,
            'MEDIA_FILE_TOO_LARGE',
          );
          await code(
            await request(path(listing.id, '/uploads'), 'POST', {
              contentType: 'image/svg+xml',
              sizeBytes: 100,
            }),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await request(path(listing.id, '/uploads'), 'POST', {
              contentType: 'image/jpeg',
              sizeBytes: 100,
              storageKey: 'victim',
            }),
            400,
            'VALIDATION_ERROR',
          );
          const intent = await initialize(listing.id);
          await code(
            await request(
              path(listing.id, `/${intent.mediaId}/complete`),
              'POST',
              {},
            ),
            400,
            'MEDIA_OBJECT_NOT_FOUND',
          );
          await source.manager.update(ListingMedia, intent.mediaId, {
            uploadExpiresAt: new Date(0),
          });
          await code(
            await request(
              path(listing.id, `/${intent.mediaId}/complete`),
              'POST',
              {},
            ),
            409,
            'MEDIA_UPLOAD_EXPIRED',
          );
          const empty = await initialize(listing.id, 100);
          assert.equal(
            (
              await fetch(empty.upload.url, {
                method: 'PUT',
                headers: { 'content-type': 'image/jpeg' },
                body: new Uint8Array(),
              })
            ).status,
            200,
          );
          await code(
            await request(
              path(listing.id, `/${empty.mediaId}/complete`),
              'POST',
              {},
            ),
            400,
            'MEDIA_INVALID_IMAGE',
          );
        },
      );
      await t.test(
        'media limit is serialized at the concurrent boundary, including pending reservations',
        async () => {
          const listing = await draft();
          await initialize(listing.id);
          await initialize(listing.id);
          const responses = await Promise.all(
            [0, 1].map(() =>
              request(path(listing.id, '/uploads'), 'POST', {
                contentType: 'image/jpeg',
                sizeBytes: 100,
              }),
            ),
          );
          assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
          await code(
            responses.find((r) => r.status === 409)!,
            409,
            'MEDIA_LIMIT_EXCEEDED',
          );
          assert.equal(
            await source.manager.countBy(ListingMedia, {
              listingId: listing.id,
            }),
            3,
          );
        },
      );
      await t.test(
        'real direct PUT and Redis worker produce three processed variants; complete is idempotent and keys/headers are scoped',
        async () => {
          const listing = await draft(),
            intent = await upload(listing.id);
          const signed = new URL(intent.upload.url);
          assert.ok(
            signed.pathname.includes(`/media/${intent.mediaId}/source/`),
          );
          assert.ok(!signed.pathname.includes('car.jpg'));
          assert.equal(signed.searchParams.get('X-Amz-Expires'), '600');
          const preflight = await fetch(intent.upload.url, {
            method: 'OPTIONS',
            headers: {
              Origin: config.webUrl,
              'Access-Control-Request-Method': 'PUT',
              'Access-Control-Request-Headers': 'content-type',
            },
          });
          assert.equal(preflight.status, 204);
          assert.equal(
            preflight.headers.get('access-control-allow-origin'),
            config.webUrl,
          );
          await complete(listing.id, intent.mediaId);
          await complete(listing.id, intent.mediaId);
          assert.equal(
            (await queue.getQueue().getJobs(['waiting'])).filter(
              (job) => job.data.mediaId === intent.mediaId,
            ).length,
            1,
          );
          await queue.getQueue().resume();
          const row = await terminal(intent.mediaId);
          await queue.getQueue().pause();
          assert.equal(row.status, 'READY');
          assert.equal(row.isPrimary, true);
          assert.equal(row.detectedFormat, 'png');
          await complete(listing.id, intent.mediaId);
          assert.equal(
            await source.manager.countBy(MediaVariant, {
              mediaId: intent.mediaId,
            }),
            3,
          );
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: intent.mediaId,
              })
            ).attempts,
            1,
          );
          const list = await json(
              await request(path(listing.id)),
              MediaListResponse,
            ),
            photo = list.items[0]!;
          assert.ok(photo.variants);
          const image = await fetch(photo.variants.large.url);
          assert.equal(image.status, 200);
          assert.equal(image.headers.get('content-type'), 'image/webp');
          assert.equal(image.headers.get('content-disposition'), 'inline');
          assert.equal(
            (await fetch(`${signed.origin}${signed.pathname}`)).status,
            403,
            'source bucket must remain private',
          );
          const tampered = new URL(intent.upload.url);
          tampered.pathname = tampered.pathname.replace(
            intent.mediaId,
            randomUUID(),
          );
          assert.equal(
            (
              await fetch(tampered, {
                method: 'PUT',
                headers: { 'content-type': 'image/jpeg' },
                body: new Uint8Array(photoBytes),
              })
            ).status,
            403,
          );
        },
      );
      await t.test(
        'MIME spoofed HTML and truncated bytes fail permanently with safe reason; wrong extension with PNG is accepted',
        async () => {
          const listing = await draft();
          for (const bytes of [
            Buffer.from('<html>not an image</html>'),
            Buffer.from([0xff, 0xd8, 0xff]),
          ]) {
            const intent = await upload(listing.id, bytes);
            await complete(listing.id, intent.mediaId);
            await processor.process(intent.mediaId);
            const row = await source.manager.findOneByOrFail(ListingMedia, {
              id: intent.mediaId,
            });
            assert.equal(row.status, 'FAILED');
            assert.equal(row.failureCode, 'INVALID_IMAGE');
            assert.equal(row.attempts, 1);
          }
          await ready(listing.id); // name is car.jpg, signed MIME JPEG, actual bytes PNG
        },
      );
      await t.test(
        'lying about byte size is rejected from actual S3 HEAD; width/pixel limits reject controlled small fixtures',
        async () => {
          const listing = await draft(),
            intent = await initialize(listing.id, 100);
          const result = await fetch(intent.upload.url, {
            method: 'PUT',
            headers: { 'content-type': 'image/jpeg' },
            body: new Uint8Array(10241),
          });
          assert.equal(result.status, 200);
          await code(
            await request(
              path(listing.id, `/${intent.mediaId}/complete`),
              'POST',
              {},
            ),
            400,
            'MEDIA_FILE_TOO_LARGE',
          );
          for (const [width, height] of [
            [101, 10],
            [95, 95],
          ]) {
            const bytes = await sharp({
              create: {
                width: width!,
                height: height!,
                channels: 3,
                background: 'blue',
              },
            })
              .png()
              .toBuffer();
            const intent = await upload(listing.id, bytes);
            await complete(listing.id, intent.mediaId);
            await processor.process(intent.mediaId);
            assert.equal(
              (
                await source.manager.findOneByOrFail(ListingMedia, {
                  id: intent.mediaId,
                })
              ).failureCode,
              'IMAGE_TOO_LARGE',
            );
          }
        },
      );
      await t.test(
        'EXIF GPS/camera metadata disappears from public outputs and orientation changes 60x40 into 40x60',
        async () => {
          const listing = await draft();
          const bytes = await sharp(photoBytes)
            .withMetadata({ orientation: 6 })
            .withExifMerge({
              IFD0: { Make: 'Private device' },
              IFD3: {
                GPSLatitudeRef: 'N',
                GPSLatitude: '52/1 22/1 0/1',
                GPSLongitudeRef: 'E',
                GPSLongitude: '4/1 54/1 0/1',
              },
            })
            .jpeg()
            .toBuffer();
          assert.ok((await sharp(bytes).metadata()).exif);
          const intent = await ready(listing.id, bytes);
          const list = await json(
            await request(path(listing.id)),
            MediaListResponse,
          );
          assert.ok(list.items[0]?.variants);
          for (const variant of Object.values(list.items[0].variants)) {
            const image = await fetch(variant.url);
            const meta = await sharp(
              Buffer.from(await image.arrayBuffer()),
            ).metadata();
            assert.equal(meta.exif, undefined);
            assert.equal(meta.orientation, undefined);
            assert.equal(meta.width, 40);
            assert.equal(meta.height, 60);
          }
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: intent.mediaId,
              })
            ).width,
            40,
          );
        },
      );
      await t.test(
        'real queue retries a transient storage failure and bounded DB attempts survive repeated deliveries',
        async () => {
          const listing = await draft(),
            intent = await upload(listing.id);
          storage.failReads = 1;
          await complete(listing.id, intent.mediaId);
          await queue.getQueue().resume();
          const row = await terminal(intent.mediaId);
          await queue.getQueue().pause();
          assert.equal(row.status, 'READY');
          assert.equal(row.attempts, 2);
          assert.ok(
            logger.entries.some(
              (entry) =>
                entry.includes(intent.mediaId) && entry.includes('"attempt":2'),
            ),
          );
          const failed = await upload(listing.id);
          await complete(listing.id, failed.mediaId);
          storage.failReads = 10;
          for (let attempt = 0; attempt < 4; attempt++) {
            if (attempt < 3)
              await assert.rejects(() => processor.process(failed.mediaId));
            else await processor.process(failed.mediaId);
          }
          storage.failReads = 0;
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: failed.mediaId,
              })
            ).status,
            'FAILED',
          );
          await processor.process(failed.mediaId);
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: failed.mediaId,
              })
            ).attempts,
            4,
          );
        },
      );
      await t.test(
        'duplicate workers and simultaneous READY completions select one primary; explicit concurrent primary changes preserve uniqueness',
        async () => {
          const listing = await draft(),
            a = await upload(listing.id),
            b = await upload(listing.id);
          await complete(listing.id, a.mediaId);
          await complete(listing.id, b.mediaId);
          await Promise.all([
            processor.process(a.mediaId),
            processor.process(a.mediaId),
            processor.process(b.mediaId),
          ]);
          assert.equal(
            await source.manager.countBy(ListingMedia, {
              listingId: listing.id,
              isPrimary: true,
            }),
            1,
          );
          assert.equal(
            await source.manager.countBy(MediaVariant, { mediaId: a.mediaId }),
            3,
          );
          const responses = await Promise.all(
            [a, b].map((intent) =>
              request(
                path(listing.id, `/${intent.mediaId}/primary`),
                'PUT',
                {},
              ),
            ),
          );
          assert.deepEqual(
            responses.map((r) => r.status),
            [200, 200],
          );
          assert.equal(
            await source.manager.countBy(ListingMedia, {
              listingId: listing.id,
              isPrimary: true,
            }),
            1,
          );
        },
      );
      await t.test(
        'full reorder swaps 0/1 safely, rejects duplicate/foreign/missing IDs and concurrent reorders remain unique',
        async () => {
          const listing = await draft(),
            a = await ready(listing.id),
            b = await ready(listing.id);
          await json(
            await request(path(listing.id, '/order'), 'PUT', {
              mediaIds: [b.mediaId, a.mediaId],
            }),
            MediaListResponse,
          );
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: b.mediaId,
              })
            ).sortOrder,
            0,
          );
          await code(
            await request(path(listing.id, '/order'), 'PUT', {
              mediaIds: [a.mediaId, a.mediaId],
            }),
            400,
            'VALIDATION_ERROR',
          );
          for (const mediaIds of [[a.mediaId], [a.mediaId, randomUUID()]])
            await code(
              await request(path(listing.id, '/order'), 'PUT', { mediaIds }),
              400,
              'MEDIA_INVALID_ORDER',
            );
          await Promise.all(
            [
              [a.mediaId, b.mediaId],
              [b.mediaId, a.mediaId],
            ].map((mediaIds) =>
              request(path(listing.id, '/order'), 'PUT', { mediaIds }),
            ),
          );
          const rows = await source.manager.findBy(ListingMedia, {
            listingId: listing.id,
          });
          assert.equal(new Set(rows.map((row) => row.sortOrder)).size, 2);
        },
      );
      await t.test(
        'pending media cannot be primary; delete is idempotent, replaces primary deterministically and frees slots',
        async () => {
          const listing = await draft(),
            a = await ready(listing.id),
            b = await ready(listing.id),
            pending = await initialize(listing.id);
          await code(
            await request(
              path(listing.id, `/${pending.mediaId}/primary`),
              'PUT',
              {},
            ),
            409,
            'MEDIA_NOT_READY',
          );
          await json(
            await request(path(listing.id, `/${a.mediaId}`), 'DELETE', {}),
            MediaListResponse,
          );
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: b.mediaId,
              })
            ).isPrimary,
            true,
          );
          await json(
            await request(path(listing.id, `/${a.mediaId}`), 'DELETE', {}),
            MediaListResponse,
          );
          await initialize(listing.id);
        },
      );
      await t.test(
        'worker/delete race never resurrects media; eventual cleanup retries and removes attempt objects idempotently',
        async () => {
          const listing = await draft(),
            intent = await upload(listing.id);
          await complete(listing.id, intent.mediaId);
          let entered!: () => void, release!: () => void;
          const enteredPromise = new Promise<void>((resolve) => {
              entered = resolve;
            }),
            releasePromise = new Promise<void>((resolve) => {
              release = resolve;
            });
          storage.beforePut = async () => {
            entered();
            await releasePromise;
          };
          const processing = processor.process(intent.mediaId);
          await enteredPromise;
          await json(
            await request(path(listing.id, `/${intent.mediaId}`), 'DELETE', {}),
            MediaListResponse,
          );
          release();
          await processing;
          storage.beforePut = undefined;
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: intent.mediaId,
              })
            ).status,
            'DELETED',
          );
          assert.equal(
            await source.manager.countBy(MediaVariant, {
              mediaId: intent.mediaId,
            }),
            0,
          );
          await source.manager.update(ListingMedia, intent.mediaId, {
            uploadExpiresAt: new Date(0),
            leaseUntil: new Date(0),
          });
          storage.failDeletes = 1;
          await assert.rejects(() => cleanup.cleanup(intent.mediaId));
          await cleanup.cleanup(intent.mediaId);
          await cleanup.cleanup(intent.mediaId);
          assert.deepEqual(await storage.keys(`media/${intent.mediaId}/`), []);
        },
      );
      await t.test(
        'expired pending objects and failed sources are cleaned; READY variants remain, and lost dispatch is recovered',
        async () => {
          const listing = await draft(),
            pending = await upload(listing.id);
          await source.manager.update(ListingMedia, pending.mediaId, {
            uploadExpiresAt: new Date(0),
          });
          await cleanup.cleanup(pending.mediaId);
          await cleanup.cleanup(pending.mediaId);
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: pending.mediaId,
              })
            ).status,
            'DELETED',
          );
          assert.deepEqual(await storage.keys(`media/${pending.mediaId}/`), []);
          const done = await ready(listing.id);
          await source.manager.update(ListingMedia, done.mediaId, {
            uploadExpiresAt: new Date(0),
          });
          await cleanup.cleanup(done.mediaId);
          assert.equal(
            (await storage.keys(`media/${done.mediaId}/`)).length,
            3,
          );
          const failedListing = await draft(),
            failed = await upload(failedListing.id, Buffer.from('malformed'));
          await complete(failedListing.id, failed.mediaId);
          await processor.process(failed.mediaId);
          await source.manager.update(ListingMedia, failed.mediaId, {
            uploadExpiresAt: new Date(0),
          });
          await cleanup.cleanup(failed.mediaId);
          assert.deepEqual(await storage.keys(`media/${failed.mediaId}/`), []);
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: failed.mediaId,
              })
            ).status,
            'FAILED',
          );
          await json(
            await request(
              path(failedListing.id, `/${failed.mediaId}`),
              'DELETE',
              {},
            ),
            MediaListResponse,
          );
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: failed.mediaId,
              })
            ).status,
            'DELETED',
          );
          const missed = await upload(listing.id);
          await source.manager.update(ListingMedia, missed.mediaId, {
            status: 'UPLOADED',
            dispatchAt: new Date(0),
          });
          // Simulate a committed completion with lost Redis dispatch.
          const privateRow = await source
            .getRepository(ListingMedia)
            .createQueryBuilder('media')
            .addSelect('media.storageKey')
            .where({ id: missed.mediaId })
            .getOneOrFail();
          await source.manager.update(ListingMedia, missed.mediaId, {
            sourceEtag: (await storage.head(privateRow.storageKey))!.etag,
          });
          await cleanup.dispatch();
          await queue.getQueue().resume();
          assert.equal((await terminal(missed.mediaId)).status, 'READY');
          await queue.getQueue().pause();
        },
      );
      await t.test(
        'submission needs a READY primary and no unfinished uploads; submit/delete race cannot produce moderation with zero photos',
        async () => {
          const empty = await draft();
          await code(
            await request(
              `me/listings/${empty.id}/submit`,
              'POST',
              {},
              access,
              1,
            ),
            400,
            'LISTING_INCOMPLETE',
          );
          const listing = await draft(),
            photo = await ready(listing.id),
            pending = await initialize(listing.id);
          await code(
            await request(
              `me/listings/${listing.id}/submit`,
              'POST',
              {},
              access,
              1,
            ),
            400,
            'LISTING_INCOMPLETE',
          );
          await json(
            await request(
              path(listing.id, `/${pending.mediaId}`),
              'DELETE',
              {},
            ),
            MediaListResponse,
          );
          const responses = await Promise.all([
            request(`me/listings/${listing.id}/submit`, 'POST', {}, access, 1),
            request(path(listing.id, `/${photo.mediaId}`), 'DELETE', {}),
          ]);
          assert.ok(responses.some((r) => r.status === 200));
          const states: { status: string; count: string }[] =
            await source.query(
              "SELECT status,(SELECT count(*) FROM listing_media WHERE listing_id=$1 AND status='READY' AND is_primary) count FROM listings WHERE id=$1",
              [listing.id],
            );
          assert.ok(
            states[0]!.status !== 'PENDING_MODERATION' ||
              states[0]!.count === '1',
          );
          const valid = await draft();
          await ready(valid.id);
          const submitted = await json(
            await request(
              `me/listings/${valid.id}/submit`,
              'POST',
              {},
              access,
              1,
            ),
            OwnerListingResponse,
          );
          assert.equal(submitted.status, 'PENDING_MODERATION');
        },
      );
      await t.test(
        'public APIs expose only READY processed cover/gallery and no private source, failures, EXIF or exact point',
        async () => {
          const listing = await draft(),
            good = await ready(listing.id),
            bad = await upload(listing.id, Buffer.from('malformed'));
          await complete(listing.id, bad.mediaId);
          await processor.process(bad.mediaId);
          await source.query(
            "UPDATE listings SET status='PUBLISHED',published_at=NOW() WHERE id=$1",
            [listing.id],
          );
          const detail = await json(
            await request(`listings/${listing.id}`, 'GET', undefined, ''),
            OwnerListingResponse,
          );
          assert.equal(detail.media.length, 1);
          assert.equal(detail.media[0]?.id, good.mediaId);
          assert.ok(detail.cover);
          const serialized = JSON.stringify(detail);
          for (const secret of [
            'source/',
            'storageKey',
            'sourceEtag',
            'uploadExpiresAt',
            'INVALID_IMAGE',
            'exactPoint',
            '52.36761234',
            'GPS',
          ])
            assert.ok(!serialized.includes(secret), secret);
          const page: unknown = await (
            await request('listings', 'GET', undefined, '')
          ).json();
          assert.ok(
            page &&
              typeof page === 'object' &&
              'items' in page &&
              Array.isArray(page.items),
          );
          const card: unknown = page.items.find(
            (item) =>
              item &&
              typeof item === 'object' &&
              'id' in item &&
              item.id === listing.id,
          );
          assert.ok(
            card &&
              typeof card === 'object' &&
              'cover' in card &&
              !('media' in card),
          );
        },
      );
      await t.test(
        'source replay after complete is pinned by ETag and never modifies immutable READY variants',
        async () => {
          const listing = await draft(),
            intent = await upload(listing.id);
          await complete(listing.id, intent.mediaId);
          const replacement = await sharp(photoBytes).jpeg().toBuffer();
          assert.equal(
            (
              await fetch(intent.upload.url, {
                method: 'PUT',
                headers: { 'content-type': 'image/jpeg' },
                body: new Uint8Array(replacement),
              })
            ).status,
            200,
          );
          await processor.process(intent.mediaId);
          assert.equal(
            (
              await source.manager.findOneByOrFail(ListingMedia, {
                id: intent.mediaId,
              })
            ).failureCode,
            'SOURCE_CHANGED',
          );
          const good = await ready(listing.id);
          const before = await source.manager.findBy(MediaVariant, {
            mediaId: good.mediaId,
          });
          await processor.process(good.mediaId);
          assert.deepEqual(
            await source.manager.findBy(MediaVariant, {
              mediaId: good.mediaId,
            }),
            before,
          );
        },
      );
      await t.test(
        'OpenAPI/audit/logging document real endpoints and never include presigned URLs, raw filenames or metadata',
        async () => {
          const document: unknown = await (
            await fetch(`${origin}/api/docs-json`)
          ).json();
          assert.ok(
            document &&
              typeof document === 'object' &&
              'paths' in document &&
              document.paths &&
              typeof document.paths === 'object',
          );
          for (const suffix of [
            '',
            '/uploads',
            '/{mediaId}/complete',
            '/order',
            '/{mediaId}/primary',
            '/{mediaId}',
          ])
            assert.ok(
              `/api/v1/me/listings/{listingId}/media${suffix}` in
                document.paths,
            );
          const audits: { action: string; metadata: unknown }[] =
            await source.query(
              "SELECT action,metadata FROM audit_logs WHERE action LIKE 'LISTING_MEDIA_%'",
            );
          for (const action of [
            'UPLOAD_INITIALIZED',
            'READY',
            'FAILED',
            'REORDERED',
            'PRIMARY_CHANGED',
            'DELETED',
          ])
            assert.ok(
              audits.some(
                (audit) => audit.action === `LISTING_MEDIA_${action}`,
              ),
              action,
            );
          const serialized = JSON.stringify({ logs: logger.entries, audits });
          for (const secret of [
            'X-Amz',
            'car.jpg',
            'GPSLatitude',
            'Private device',
            config.storage.secretKey,
            config.redis.password,
          ])
            assert.ok(!serialized.includes(secret), secret);
          assert.deepEqual(
            (await source.driver.createSchemaBuilder().log()).upQueries,
            [],
          );
        },
      );
    } finally {
      await worker.onModuleDestroy();
      await queue.getQueue().obliterate({ force: true });
      const rows = await source.manager.find(ListingMedia);
      for (const row of rows)
        for (const key of await storage.keys(`media/${row.id}/`))
          await storage.delete(key);
      await app.close();
      await storage.onApplicationShutdown();
      await database.close();
    }
  },
);
