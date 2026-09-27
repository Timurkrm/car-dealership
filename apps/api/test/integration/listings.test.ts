import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import type { Logger } from 'typeorm';
import { ApiException } from '../../src/platform/http/api-error';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { RedisConnection } from '../../src/platform/redis/redis.connection';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import type { LogFields } from '../../src/platform/logging/structured-logger';
import type { LogLevel } from '../../src/config/config';
import { RequestRateGuard } from '../../src/platform/http/request-rate.guard';
import { AuditWriter } from '../../src/modules/audit';
import { AuthTokens } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { OwnerListingResponse } from '../../src/modules/listings/http/listing.dto';
import { createSchemaDatabase } from '../support/schema-database';
import { seedReadyPhoto } from '../support/ready-media-fixture';
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
class QueryCounter implements Logger {
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
const draft = () => ({
  vehicle: {
    modelId: fixture.model,
    generationId: fixture.generation,
    year: 2022,
    mileageKm: 12000,
    bodyType: 'SEDAN',
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    driveType: 'RWD',
    condition: 'USED',
    vin: ' wba8a9c50gk123456 ',
  },
  listing: {
    title: '  BMW 3 Series 2022  ',
    description: 'Maintained carefully.\r\n<script>alert(1)</script>',
    price: { amountMinor: '9007199254740993', currency: 'eur' },
  },
  location: {
    latitude: 52.36761234,
    longitude: 4.90411234,
    city: ' Amsterdam ',
    region: null,
    countryCode: 'nl',
  },
});

test(
  'listing workflows on owned PostGIS database: ownership, atomicity, concurrency and projections',
  { timeout: 180000 },
  async (t) => {
    const database = await createSchemaDatabase();
    const { source } = database;
    const base = loadConfig('test');
    const config = {
      ...base,
      swagger: true,
      database: { ...base.database, name: String(source.options.database) },
    };
    const logger = new CaptureLogger(config);
    const counter = new QueryCounter();
    source.logger = counter;
    const audit = new AuditWriter(source);
    const realAppend = audit.append.bind(audit);
    let failAudit = false;
    audit.append = async (entry, manager) => {
      if (failAudit && entry.action.startsWith('LISTING_'))
        throw new Error('simulated audit failure');
      return realAppend(entry, manager);
    };
    await source.runMigrations();
    await seedMarketplaceFixture(source);
    await source.query(
      'UPDATE users SET email_verified_at = CURRENT_TIMESTAMP',
    );
    await source.query(
      'UPDATE user_sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [fixture.session],
    );
    const otherSession = randomUUID();
    await source.query(
      'INSERT INTO user_sessions(id, user_id, expires_at, last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
      [otherSession, fixture.buyer, '2100-01-01T00:00:00Z'],
    );
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
      .overrideProvider(StructuredLogger)
      .useValue(logger)
      .overrideProvider(AuditWriter)
      .useValue(audit)
      .overrideGuard(RequestRateGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication({
      bodyParser: false,
      logger: false,
    });
    configureApp(app, config);
    let origin = '';
    let access = '';
    let foreign = '';
    let created: OwnerListingResponse;
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
          'x-request-id': 'listing-integration',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    async function code(response: Response, status: number, expected: string) {
      const value: unknown = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      assert.ok(value && typeof value === 'object' && 'code' in value);
      assert.equal(value.code, expected);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    async function owner(response: Response, status = 200) {
      const value: unknown = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      const listing = plainToInstance(OwnerListingResponse, value);
      assert.equal(typeof listing.id, 'string');
      assert.equal(response.headers.get('etag'), `"${listing.version}"`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return listing;
    }
    const create = (body: object = draft()) =>
      request('listings', 'POST', body)
        .then((response) => owner(response, 201))
        .then(async (listing) => {
          await seedReadyPhoto(source, listing.id);
          return listing;
        });
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
        sessionId: otherSession,
        roles: ['USER'],
      });

      await t.test(
        'anonymous cannot create or reach seller routes; protected reads use current account/session',
        async () => {
          await code(
            await request('listings', 'POST', draft(), ''),
            401,
            'AUTHENTICATION_REQUIRED',
          );
          await code(
            await request('me/listings', 'GET', undefined, ''),
            401,
            'AUTHENTICATION_REQUIRED',
          );
          await source.query(
            "UPDATE users SET status = 'BLOCKED' WHERE id = $1",
            [fixture.buyer],
          );
          await code(
            await request('me/listings', 'GET', undefined, foreign),
            403,
            'ACCOUNT_BLOCKED',
          );
          await source.query(
            "UPDATE users SET status = 'ACTIVE' WHERE id = $1",
            [fixture.buyer],
          );
        },
      );
      await t.test(
        'create persists principal ownership, positive exact money, normalized VIN and ordered SRID4326 point',
        async () => {
          created = await create();
          assert.equal(created.status, 'DRAFT');
          assert.equal(created.version, 1);
          assert.equal(created.title, 'BMW 3 Series 2022');
          assert.equal(created.price.amountMinor, '9007199254740993');
          assert.equal(created.price.currency, 'EUR');
          assert.equal(created.vehicle.vin, 'WBA8A9C50GK123456');
          assert.equal(created.publishedAt, null);
          assert.equal(created.submittedAt, null);
          const rows: {
            seller_id: string;
            vehicle_id: string;
            lon: number;
            lat: number;
            srid: number;
            public_point: unknown;
          }[] = await source.query(
            'SELECT seller_id, vehicle_id, ST_X(point) lon, ST_Y(point) lat, ST_SRID(point) srid, public_point FROM listings JOIN vehicle_listings ON vehicle_listings.listing_id = listings.id JOIN listing_locations ON listing_locations.listing_id = listings.id WHERE listings.id = $1',
            [created.id],
          );
          assert.equal(rows[0]?.seller_id, fixture.seller);
          assert.equal(rows[0]?.vehicle_id, created.vehicle.id);
          assert.equal(rows[0]?.lon, 4.90411234);
          assert.equal(rows[0]?.lat, 52.36761234);
          assert.equal(rows[0]?.srid, 4326);
          assert.equal(rows[0]?.public_point, null);
          assert.equal(
            created.description,
            'Maintained carefully.\n<script>alert(1)</script>',
          );
        },
      );
      await t.test(
        'mass assignment is rejected at every nesting level and action bodies reject status injection',
        async () => {
          for (const extra of [
            { sellerId: fixture.buyer },
            { status: 'PUBLISHED' },
            { version: 5 },
            { publishedAt: '2026-01-01' },
          ])
            await code(
              await request('listings', 'POST', { ...draft(), ...extra }),
              400,
              'VALIDATION_ERROR',
            );
          await code(
            await request('listings', 'POST', {
              ...draft(),
              vehicle: {
                ...draft().vehicle,
                id: fixture.vehicles[0],
                makeId: 'x',
              },
            }),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              { listing: { status: 'PUBLISHED' } },
              access,
              1,
            ),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await request(
              `me/listings/${created.id}/archive`,
              'POST',
              { status: 'ARCHIVED' },
              access,
              1,
            ),
            400,
            'VALIDATION_ERROR',
          );
        },
      );
      await t.test(
        'catalog and vehicle constraints return clear errors before insert',
        async () => {
          for (const [vehicle, expected] of [
            [{ modelId: fixture.missing }, 'VEHICLE_MODEL_NOT_FOUND'],
            [{ generationId: fixture.missing }, 'VEHICLE_GENERATION_NOT_FOUND'],
            [
              { generationId: fixture.otherGeneration },
              'VEHICLE_GENERATION_MODEL_MISMATCH',
            ],
          ] as const)
            await code(
              await request('listings', 'POST', {
                ...draft(),
                vehicle: { ...draft().vehicle, ...vehicle },
              }),
              400,
              expected,
            );
          for (const vehicle of [
            { year: 1885 },
            { mileageKm: -1 },
            { enginePowerHp: 0 },
            { engineDisplacementCc: 1.5 },
            { vin: 'INVALID' },
            { fuelType: 'WOOD' },
          ])
            await code(
              await request('listings', 'POST', {
                ...draft(),
                vehicle: { ...draft().vehicle, ...vehicle },
              }),
              400,
              'VALIDATION_ERROR',
            );
          await code(
            await request('listings', 'POST', {
              ...draft(),
              listing: {
                ...draft().listing,
                price: { amountMinor: '9223372036854775808', currency: 'EUR' },
              },
            }),
            400,
            'INVALID_PRICE',
          );
          for (const price of [
            { amountMinor: 100, currency: 'EUR' },
            { amountMinor: '0', currency: 'EUR' },
            { amountMinor: '1', currency: 'ZZZ' },
          ])
            await code(
              await request('listings', 'POST', {
                ...draft(),
                listing: { ...draft().listing, price },
              }),
              400,
              'VALIDATION_ERROR',
            );
          await code(
            await request('listings', 'POST', {
              ...draft(),
              location: { ...draft().location, latitude: 91 },
            }),
            400,
            'VALIDATION_ERROR',
          );
        },
      );
      await t.test(
        'create rollback includes vehicle, listing, location and audit; edit failure leaves version and specs intact',
        async () => {
          const counts = () =>
            source.query(
              'SELECT (SELECT count(*) FROM vehicles) vehicles, (SELECT count(*) FROM listings) listings, (SELECT count(*) FROM listing_locations) locations, (SELECT count(*) FROM audit_logs) audits',
            );
          const before: unknown = await counts();
          failAudit = true;
          try {
            await code(
              await request('listings', 'POST', draft()),
              500,
              'INTERNAL_ERROR',
            );
            await code(
              await request(
                `me/listings/${created.id}/submit`,
                'POST',
                {},
                access,
                1,
              ),
              500,
              'INTERNAL_ERROR',
            );
            await code(
              await request(
                `me/listings/${created.id}/archive`,
                'POST',
                {},
                access,
                1,
              ),
              500,
              'INTERNAL_ERROR',
            );
            await code(
              await request(
                `me/listings/${fixture.listings[0]}/mark-sold`,
                'POST',
                {},
                access,
                1,
              ),
              500,
              'INTERNAL_ERROR',
            );
            assert.deepEqual(await counts(), before);
            await code(
              await request(
                `me/listings/${created.id}`,
                'PATCH',
                { vehicle: { mileageKm: 15000 }, location: null },
                access,
                1,
              ),
              500,
              'INTERNAL_ERROR',
            );
          } finally {
            failAudit = false;
          }
          assert.deepEqual(await counts(), before);
          const unchanged = await owner(
            await request(`me/listings/${created.id}`),
          );
          assert.equal(unchanged.vehicle.mileageKm, 12000);
          assert.equal(unchanged.version, 1);
          assert.ok(unchanged.location);
          assert.equal(unchanged.status, 'DRAFT');
          assert.equal(unchanged.submittedAt, null);
          assert.equal(unchanged.archivedAt, null);
          const published = await owner(
            await request(`me/listings/${fixture.listings[0]}`),
          );
          assert.equal(published.status, 'PUBLISHED');
          assert.equal(published.soldAt, null);
          assert.equal(published.version, 1);
        },
      );
      await t.test(
        'foreign actor cannot read, edit, submit, archive or sell; ADMIN does not bypass ownership',
        async () => {
          await source.query(
            "INSERT INTO user_roles(user_id, role) VALUES ($1,'ADMIN')",
            [fixture.buyer],
          );
          await code(
            await request(
              `me/listings/${created.id}`,
              'GET',
              undefined,
              foreign,
            ),
            404,
            'LISTING_NOT_FOUND',
          );
          await code(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              { listing: { title: 'Hijack' } },
              foreign,
              1,
            ),
            404,
            'LISTING_NOT_FOUND',
          );
          for (const action of ['submit', 'archive', 'mark-sold'])
            await code(
              await request(
                `me/listings/${created.id}/${action}`,
                'POST',
                {},
                foreign,
                1,
              ),
              404,
              'LISTING_NOT_FOUND',
            );
          const value: unknown = await (
            await request('me/listings', 'GET', undefined, foreign)
          ).json();
          assert.ok(value && typeof value === 'object' && 'items' in value);
          assert.deepEqual(value.items, []);
        },
      );
      await t.test(
        'required If-Match, partial null semantics, catalog revalidation and successful owner edit',
        async () => {
          await code(
            await request(`me/listings/${created.id}`, 'PATCH', {
              listing: { title: 'Edit' },
            }),
            428,
            'LISTING_VERSION_REQUIRED',
          );
          await code(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              { vehicle: { modelId: null } },
              access,
              1,
            ),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              { vehicle: { generationId: fixture.otherGeneration } },
              access,
              1,
            ),
            400,
            'VEHICLE_GENERATION_MODEL_MISMATCH',
          );
          await code(
            await request(`me/listings/${created.id}`, 'PATCH', {}, access, 1),
            400,
            'VALIDATION_ERROR',
          );
          const updated = await owner(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              {
                vehicle: { mileageKm: 16000, vin: null },
                listing: { title: 'Edited BMW' },
              },
              access,
              1,
            ),
          );
          assert.equal(updated.version, 2);
          assert.equal(updated.vehicle.mileageKm, 16000);
          assert.equal(updated.vehicle.vin, null);
          assert.equal(updated.title, 'Edited BMW');
          assert.equal(updated.price.amountMinor, created.price.amountMinor);
          assert.ok(updated.location);
          created = updated;
          const located = await owner(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              {
                location: {
                  latitude: 53.123456,
                  longitude: 5.123456,
                  city: 'Updated city',
                  region: 'Region',
                  countryCode: 'NL',
                  publicPoint: { latitude: 53.12, longitude: 5.12 },
                },
              },
              access,
              created.version,
            ),
          );
          assert.deepEqual(located.location?.exactPoint, {
            latitude: 53.123456,
            longitude: 5.123456,
          });
          assert.deepEqual(located.location?.publicPoint, {
            latitude: 53.12,
            longitude: 5.12,
          });
          created = await owner(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              {
                location: {
                  latitude: 53.123456,
                  longitude: 5.123456,
                  city: 'Updated city',
                  countryCode: 'NL',
                },
              },
              access,
              located.version,
            ),
          );
          assert.equal(created.location?.publicPoint, null);
          assert.equal(created.location?.region, null);
        },
      );
      await t.test(
        'real parallel updates have exactly one winner, stale retry conflicts and losing writes roll back',
        async () => {
          const before = await owner(
            await request(`me/listings/${created.id}`),
          );
          const responses = await Promise.all(
            [17000, 18000].map((mileageKm) =>
              request(
                `me/listings/${created.id}`,
                'PATCH',
                { vehicle: { mileageKm } },
                access,
                before.version,
              ),
            ),
          );
          assert.deepEqual(
            responses.map((response) => response.status).sort(),
            [200, 409],
          );
          const winner = await owner(
            responses.find((response) => response.status === 200) ??
              assert.fail('No winner'),
          );
          await code(
            responses.find((response) => response.status === 409) ??
              assert.fail('No conflict'),
            409,
            'LISTING_VERSION_CONFLICT',
          );
          await code(
            await request(
              `me/listings/${created.id}`,
              'PATCH',
              { listing: { title: 'Stale overwrite' } },
              access,
              before.version,
            ),
            409,
            'LISTING_VERSION_CONFLICT',
          );
          const persisted = await owner(
            await request(`me/listings/${created.id}`),
          );
          assert.equal(persisted.vehicle.mileageKm, winner.vehicle.mileageKm);
          assert.equal(persisted.version, before.version + 1);
        },
      );
      await t.test(
        'editing shared vehicle clones specifications without mutating another historical listing',
        async () => {
          const copy = await create();
          await source.query(
            'UPDATE vehicle_listings SET vehicle_id = $1 WHERE listing_id = $2',
            [fixture.vehicles[0], copy.id],
          );
          const updated = await owner(
            await request(
              `me/listings/${copy.id}`,
              'PATCH',
              { vehicle: { mileageKm: 77777 } },
              access,
              1,
            ),
          );
          assert.notEqual(updated.vehicle.id, fixture.vehicles[0]);
          const historical = await owner(
            await request(`me/listings/${fixture.listings[0]}`),
          );
          assert.equal(historical.vehicle.mileageKm, 0);
        },
      );
      await t.test(
        'incomplete draft cannot submit; ready draft sets submittedAt without publishing; pending edits are forbidden',
        async () => {
          const noLocation = await create({ ...draft(), location: null });
          await code(
            await request(
              `me/listings/${noLocation.id}/submit`,
              'POST',
              {},
              access,
              1,
            ),
            400,
            'LISTING_INCOMPLETE',
          );
          const noDescription = await create({
            ...draft(),
            listing: { ...draft().listing, description: null },
          });
          await code(
            await request(
              `me/listings/${noDescription.id}/submit`,
              'POST',
              {},
              access,
              1,
            ),
            400,
            'LISTING_INCOMPLETE',
          );
          const ready = await create();
          const submitted = await owner(
            await request(
              `me/listings/${ready.id}/submit`,
              'POST',
              {},
              access,
              1,
            ),
          );
          assert.equal(submitted.status, 'PENDING_MODERATION');
          assert.ok(submitted.submittedAt);
          assert.equal(submitted.publishedAt, null);
          await code(
            await request(
              `me/listings/${ready.id}`,
              'PATCH',
              { listing: { title: 'Cannot edit' } },
              access,
              2,
            ),
            409,
            'LISTING_INVALID_STATE',
          );
          await code(
            await request(
              `me/listings/${ready.id}/submit`,
              'POST',
              {},
              access,
              2,
            ),
            409,
            'LISTING_INVALID_STATE_TRANSITION',
          );
          await source.query(
            "UPDATE listings SET status = 'REJECTED', submitted_at = $2 WHERE id = $1",
            [ready.id, '2020-01-01T00:00:00Z'],
          );
          const edited = await owner(
            await request(
              `me/listings/${ready.id}`,
              'PATCH',
              { listing: { title: 'Corrected' } },
              access,
              2,
            ),
          );
          const resubmitted = await owner(
            await request(
              `me/listings/${ready.id}/submit`,
              'POST',
              {},
              access,
              edited.version,
            ),
          );
          assert.equal(resubmitted.status, 'PENDING_MODERATION');
          assert.ok(
            resubmitted.submittedAt && resubmitted.submittedAt > '2020',
          );
        },
      );
      await t.test(
        'submit/archive race has one CAS winner; archive repeats only with current version without duplicate audit',
        async () => {
          const ready = await create();
          const responses = await Promise.all(
            ['submit', 'archive'].map((action) =>
              request(
                `me/listings/${ready.id}/${action}`,
                'POST',
                {},
                access,
                1,
              ),
            ),
          );
          assert.deepEqual(
            responses.map((response) => response.status).sort(),
            [200, 409],
          );
          const winner = await owner(
            responses.find((response) => response.status === 200) ??
              assert.fail('No winner'),
          );
          await code(
            responses.find((response) => response.status === 409) ??
              assert.fail('No conflict'),
            409,
            'LISTING_VERSION_CONFLICT',
          );
          const archived =
            winner.status === 'ARCHIVED'
              ? winner
              : await owner(
                  await request(
                    `me/listings/${ready.id}/archive`,
                    'POST',
                    {},
                    access,
                    winner.version,
                  ),
                );
          const repeat = await owner(
            await request(
              `me/listings/${ready.id}/archive`,
              'POST',
              {},
              access,
              archived.version,
            ),
          );
          assert.equal(repeat.version, archived.version);
          assert.equal(repeat.archivedAt, archived.archivedAt);
          const rows: { count: string }[] = await source.query(
            "SELECT count(*) FROM audit_logs WHERE target_id = $1 AND action = 'LISTING_ARCHIVED'",
            [ready.id],
          );
          assert.equal(rows[0]?.count, '1');
          await code(
            await request(
              `me/listings/${ready.id}/archive`,
              'POST',
              {},
              access,
              1,
            ),
            409,
            'LISTING_VERSION_CONFLICT',
          );
        },
      );
      await t.test(
        'public visibility is explicit for every status; SOLD detail remains historical but disappears from public lists',
        async () => {
          const listing = await create();
          for (const status of [
            'DRAFT',
            'PENDING_MODERATION',
            'REJECTED',
            'ARCHIVED',
          ]) {
            await source.query(
              'UPDATE listings SET status=$2, submitted_at=CURRENT_TIMESTAMP, archived_at=CURRENT_TIMESTAMP WHERE id=$1',
              [listing.id, status],
            );
            await code(
              await request(`listings/${listing.id}`, 'GET', undefined, ''),
              404,
              'LISTING_NOT_FOUND',
            );
          }
          await source.query(
            "UPDATE listings SET status='PUBLISHED', published_at=CURRENT_TIMESTAMP, archived_at=NULL WHERE id=$1",
            [listing.id],
          );
          assert.equal(
            (await request(`listings/${listing.id}`, 'GET', undefined, ''))
              .status,
            200,
          );
          await code(
            await request(
              `me/listings/${listing.id}`,
              'PATCH',
              { listing: { title: 'No published edit' } },
              access,
              1,
            ),
            409,
            'LISTING_INVALID_STATE',
          );
          const sold = await owner(
            await request(
              `me/listings/${listing.id}/mark-sold`,
              'POST',
              {},
              access,
              1,
            ),
          );
          assert.equal(sold.status, 'SOLD');
          assert.ok(sold.soldAt);
          assert.ok(sold.publishedAt);
          assert.equal(
            (await request(`listings/${listing.id}`, 'GET', undefined, ''))
              .status,
            200,
          );
          const body: unknown = await (
            await request('listings', 'GET', undefined, '')
          ).json();
          assert.ok(
            body &&
              typeof body === 'object' &&
              'items' in body &&
              Array.isArray(body.items),
          );
          assert.equal(
            body.items.some(
              (row: unknown) =>
                row &&
                typeof row === 'object' &&
                'id' in row &&
                row.id === listing.id,
            ),
            false,
          );
          await code(
            await request(
              `me/listings/${listing.id}`,
              'PATCH',
              { listing: { title: 'No sold edit' } },
              access,
              2,
            ),
            409,
            'LISTING_INVALID_STATE',
          );
          const archived = await owner(
            await request(
              `me/listings/${listing.id}/archive`,
              'POST',
              {},
              access,
              2,
            ),
          );
          assert.equal(archived.soldAt, sold.soldAt);
          assert.equal(archived.publishedAt, sold.publishedAt);
          await code(
            await request(`listings/${listing.id}`, 'GET', undefined, ''),
            404,
            'LISTING_NOT_FOUND',
          );
        },
      );
      await t.test(
        'public serialized responses never expose exact coordinates, VIN, contact data, storage keys or version',
        async () => {
          const response = await request(
            `listings/${fixture.listings[0]}`,
            'GET',
            undefined,
            '',
          );
          const value: unknown = await response.json();
          assert.equal(response.status, 200);
          const serialized = JSON.stringify(value);
          for (const key of [
            'vin',
            'exactPoint',
            'point',
            'email',
            'phone',
            'storageKey',
            'version',
            'submittedAt',
            'archivedAt',
            'sellerId',
            'WBA8A9C50GK123456',
            '52.3676',
            '4.9041',
          ])
            assert.equal(
              serialized.includes(`"${key}"`) ||
                serialized.includes(
                  key === 'WBA8A9C50GK123456' ||
                    key === '52.3676' ||
                    key === '4.9041'
                    ? key
                    : `"${key}"`,
                ),
              false,
              key,
            );
          assert.ok(
            value &&
              typeof value === 'object' &&
              'location' in value &&
              value.location &&
              typeof value.location === 'object' &&
              'publicPoint' in value.location,
          );
          assert.equal(value.location.publicPoint, null);
          await source.query(
            'UPDATE listing_locations SET public_point=ST_SetSRID(ST_MakePoint(4.9,52.36),4326) WHERE listing_id=$1',
            [fixture.listings[0]],
          );
          const safe: unknown = await (
            await request(
              `listings/${fixture.listings[0]}`,
              'GET',
              undefined,
              '',
            )
          ).json();
          assert.ok(
            safe &&
              typeof safe === 'object' &&
              'location' in safe &&
              safe.location &&
              typeof safe.location === 'object' &&
              'publicPoint' in safe.location,
          );
          assert.deepEqual(safe.location.publicPoint, {
            latitude: 52.36,
            longitude: 4.9,
          });
        },
      );
      await t.test(
        'catalog routes are bounded, deterministic, scoped to parents and validate IDs',
        async () => {
          const read = async (path: string) => {
            const response = await request(path, 'GET', undefined, '');
            assert.equal(response.status, 200);
            const value: unknown = await response.json();
            assert.ok(
              value &&
                typeof value === 'object' &&
                'items' in value &&
                Array.isArray(value.items),
            );
            return value.items;
          };
          const makes = await read('catalog/vehicle-makes?limit=2');
          assert.equal(makes.length, 2);
          assert.deepEqual(await read('catalog/vehicle-makes?limit=2'), makes);
          const models = await read(
            'catalog/vehicle-makes/10000000-0000-4000-8000-000000000001/models',
          );
          assert.ok(models.length);
          const generations = await read(
            `catalog/vehicle-models/${fixture.model}/generations`,
          );
          assert.ok(generations.length);
          for (const row of generations)
            assert.ok(
              row &&
                typeof row === 'object' &&
                'modelId' in row &&
                row.modelId === fixture.model,
            );
          await code(
            await request(
              'catalog/vehicle-makes/not-uuid/models',
              'GET',
              undefined,
              '',
            ),
            400,
            'BAD_REQUEST',
          );
          await code(
            await request(
              `catalog/vehicle-makes/${fixture.missing}/models`,
              'GET',
              undefined,
              '',
            ),
            404,
            'VEHICLE_MAKE_NOT_FOUND',
          );
          await code(
            await request(
              'catalog/vehicle-makes?limit=51',
              'GET',
              undefined,
              '',
            ),
            400,
            'VALIDATION_ERROR',
          );
        },
      );
      await t.test(
        'seller/public pages validate filters and stable ordering and batch reads avoid N+1',
        async () => {
          await code(
            await request('me/listings?offset=10001'),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await request('me/listings?status=UNKNOWN'),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await request('me/listings?sort=price'),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await request('listings?limit=1000', 'GET', undefined, ''),
            400,
            'SEARCH_INVALID_FILTER',
          );
          const count = async (limit: number, ownerMode: boolean) => {
            counter.queries = [];
            const response = await request(
              `${ownerMode ? 'me/' : ''}listings?limit=${limit}`,
              'GET',
              undefined,
              ownerMode ? access : '',
            );
            assert.equal(response.status, 200);
            await response.json();
            return counter.queries.filter((query) => query.startsWith('SELECT'))
              .length;
          };
          assert.equal(await count(1, false), 1);
          assert.equal(await count(50, false), 1);
          assert.equal(await count(1, true), await count(50, true));
          const a = await create();
          const b = await create();
          await source.query(
            "UPDATE listings SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP WHERE id IN ($1,$2)",
            [a.id, b.id],
          );
          const firstResponse = await request(
            'listings?limit=1',
            'GET',
            undefined,
            '',
          );
          assert.equal(firstResponse.status, 200);
          const first: {
            items: { id: string }[];
            page: { nextCursor: string };
          } = await firstResponse.json();
          assert.ok(first.page.nextCursor);
          const secondResponse = await request(
            'listings?limit=1&cursor=' +
              encodeURIComponent(first.page.nextCursor),
            'GET',
            undefined,
            '',
          );
          assert.equal(secondResponse.status, 200);
          const second: { items: { id: string }[] } =
            await secondResponse.json();
          assert.notEqual(first.items[0]?.id, second.items[0]?.id);
          const statusPage: unknown = await (
            await request('me/listings?status=DRAFT&sort=updated_newest')
          ).json();
          assert.ok(
            statusPage &&
              typeof statusPage === 'object' &&
              'items' in statusPage &&
              Array.isArray(statusPage.items),
          );
          for (const item of statusPage.items)
            assert.ok(
              item &&
                typeof item === 'object' &&
                'status' in item &&
                item.status === 'DRAFT',
            );
        },
      );
      await t.test(
        'audit records required events with correlation and machine metadata without user values; logs exclude secrets',
        async () => {
          const rows: {
            action: string;
            metadata: unknown;
            request_id: string;
          }[] = await source.query(
            "SELECT action, metadata, request_id FROM audit_logs WHERE request_id='listing-integration'",
          );
          for (const action of [
            'LISTING_CREATED',
            'LISTING_UPDATED',
            'LISTING_SUBMITTED',
            'LISTING_ARCHIVED',
            'LISTING_MARKED_SOLD',
          ])
            assert.ok(
              rows.some((row) => row.action === action),
              action,
            );
          const serialized = JSON.stringify(rows) + logger.entries.join('\n');
          for (const value of [
            access,
            foreign,
            config.auth.accessSecret,
            'WBA8A9C50GK123456',
            '52.36761234',
            '4.90411234',
            '<script>',
            'Maintained carefully',
            'seller@example.test',
          ])
            assert.equal(serialized.includes(value), false);
        },
      );
      await t.test(
        'OpenAPI describes nested request/response, pagination, bearer and If-Match contracts',
        async () => {
          const value: unknown = await (
            await fetch(`${origin}/api/docs-json`)
          ).json();
          const serialized = JSON.stringify(value);
          for (const route of [
            '/api/v1/listings',
            '/api/v1/me/listings/{id}',
            '/api/v1/me/listings/{id}/submit',
            '/api/v1/catalog/vehicle-makes',
          ])
            assert.ok(serialized.includes(route));
          for (const contract of [
            'If-Match',
            'OwnerListingResponse',
            'PublicListingResponse',
            'bearer',
            '428',
            'limit',
            'LISTING_VERSION_CONFLICT',
          ])
            assert.ok(serialized.includes(contract));
        },
      );
      await t.test(
        'real isolated Redis limits creation atomically and infrastructure failure is explicit',
        async () => {
          const guard = new RequestRateGuard(
            new Reflector(),
            config,
            app.get(RedisConnection),
          );
          const actor = randomUUID();
          const results = await Promise.all(
            Array.from({ length: 11 }, () =>
              guard.consume('listingCreate', actor),
            ),
          );
          assert.equal(results.filter((result) => result === 0).length, 10);
          assert.equal(results.filter((result) => result > 0).length, 1);
          const redis = app.get<RedisConnection>(RedisConnection);
          const consume = redis.consumeLimits.bind(redis);
          redis.consumeLimits = async () => {
            throw new Error('simulated Redis outage');
          };
          try {
            await assert.rejects(
              guard.consume('listingPublic', 'test'),
              (error: unknown) =>
                error instanceof ApiException &&
                error.code === 'RATE_LIMIT_UNAVAILABLE' &&
                error.getStatus() === 503,
            );
          } finally {
            redis.consumeLimits = consume;
          }
        },
      );
      await t.test(
        'query plans and unchanged migrated schema are inspected against real PostgreSQL',
        async () => {
          for (const [sql, params] of [
            [
              "SELECT id FROM listings WHERE status='PUBLISHED' ORDER BY published_at DESC,id DESC LIMIT 20",
              [],
            ],
            [
              'SELECT id FROM listings WHERE seller_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',
              [fixture.seller],
            ],
            [
              'SELECT id FROM vehicle_models WHERE make_id=$1 ORDER BY name,id LIMIT 50',
              ['10000000-0000-4000-8000-000000000001'],
            ],
          ] as const) {
            const plan: unknown = await source.query(
              `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
              [...params],
            );
            assert.ok(plan);
          }
          const diff = await source.driver.createSchemaBuilder().log();
          assert.equal(diff.upQueries.length, 0);
        },
      );
    } finally {
      await app.close();
      await database.close();
    }
  },
);
