import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { RequestRateGuard } from '../../src/platform/http/request-rate.guard';
import { AuthTokens } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import {
  seedPartCatalog,
  PART_BRAND_IDS,
  PART_CATEGORY_IDS,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';
import { createSchemaDatabase } from '../support/schema-database';
import { seedReadyPhoto } from '../support/ready-media-fixture';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';

test(
  'moderation/admin HTTP workflows enforce roles, CAS, privacy, reports and session revocation',
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
    await source.runMigrations();
    await seedMarketplaceFixture(source);
    await source.transaction(seedPartCatalog);
    await source.query(
      'UPDATE users SET email_verified_at = CURRENT_TIMESTAMP',
    );

    const adminId = randomUUID();
    await source.query(
      "INSERT INTO users(id,email_normalized,display_name,status,email_verified_at) VALUES ($1,'admin@example.test','Administrator','ACTIVE',CURRENT_TIMESTAMP)",
      [adminId],
    );
    await source.query(
      "INSERT INTO user_roles(user_id,role) VALUES ($1,'USER'),($1,'ADMIN')",
      [adminId],
    );
    const sessions = {
      seller: randomUUID(),
      moderator: randomUUID(),
      admin: randomUUID(),
      buyer: randomUUID(),
    };
    for (const [userId, sessionId] of [
      [fixture.seller, sessions.seller],
      [fixture.moderator, sessions.moderator],
      [adminId, sessions.admin],
      [fixture.buyer, sessions.buyer],
    ])
      await source.query(
        'INSERT INTO user_sessions(id,user_id,expires_at,last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
        [sessionId, userId, '2100-01-01T00:00:00Z'],
      );

    const carId = randomUUID();
    const carVehicleId = randomUUID();
    const partId = randomUUID();
    const partListingId = randomUUID();
    const raceId = randomUUID();
    const raceVehicleId = randomUUID();
    const blockedListingId = randomUUID();
    const blockedVehicleId = randomUUID();
    await source.query(
      `INSERT INTO vehicles(id,model_id,generation_id,year,mileage_km,body_type,fuel_type,transmission,drive_type,condition,color,vin)
       VALUES ($1,$2,$3,2023,14000,'SEDAN','PETROL','AUTOMATIC','RWD','USED','BLUE','WBA8A9C50GK123456'),
              ($4,$2,$3,2024,1000,'SEDAN','PETROL','AUTOMATIC','RWD','USED','BLACK','WBA8A9C50GK123457'),
              ($5,$2,$3,2022,22000,'SEDAN','PETROL','AUTOMATIC','RWD','USED','WHITE','WBA8A9C50GK123458')`,
      [
        carVehicleId,
        fixture.model,
        fixture.generation,
        raceVehicleId,
        blockedVehicleId,
      ],
    );
    await source.query(
      `INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status,submitted_at)
       VALUES ($1,$2,'VEHICLE','Moderate car','Complete vehicle','2000000','EUR','PENDING_MODERATION','2026-09-19T08:00:00Z'),
              ($3,$2,'VEHICLE','Concurrent car','Race vehicle','2100000','EUR','PENDING_MODERATION','2026-09-19T09:00:00Z'),
              ($4,$5,'VEHICLE','Blocked seller car','Complete vehicle','2200000','EUR','PENDING_MODERATION','2026-09-19T10:00:00Z')`,
      [carId, fixture.seller, raceId, blockedListingId, fixture.buyer],
    );
    await source.query(
      'INSERT INTO vehicle_listings(listing_id,vehicle_id) VALUES ($1,$2),($3,$4),($5,$6)',
      [
        carId,
        carVehicleId,
        raceId,
        raceVehicleId,
        blockedListingId,
        blockedVehicleId,
      ],
    );
    for (const id of [carId, raceId, blockedListingId])
      await source.query(
        `INSERT INTO listing_locations(listing_id,point,public_point,city,country_code)
         VALUES ($1,ST_SetSRID(ST_MakePoint(4.90411234,52.36761234),4326),ST_SetSRID(ST_MakePoint(4.90,52.36),4326),'Amsterdam','NL')`,
        [id],
      );
    await source.query(
      `INSERT INTO parts(id,category_id,brand_id,name,condition,fitment_mode)
       VALUES ($1,$2,$3,'Brake pad set','NEW','UNIVERSAL')`,
      [partId, PART_CATEGORY_IDS.pads, PART_BRAND_IDS.bosch],
    );
    await source.query(
      `INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status,submitted_at)
       VALUES ($1,$2,'PART','Brake pads','Fits advertised models','15000','EUR','PENDING_MODERATION','2026-09-19T08:30:00Z')`,
      [partListingId, fixture.seller],
    );
    await source.query(
      'INSERT INTO part_listings(listing_id,part_id,quantity_available) VALUES ($1,$2,3)',
      [partListingId, partId],
    );
    for (const id of [carId, raceId, blockedListingId, partListingId])
      await seedReadyPhoto(source, id);

    const module = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    })
      .overrideProvider(DatabaseConnection)
      .useValue({ source, check: async () => source.query('SELECT 1') })
      .overrideProvider(ObjectStorage)
      .useValue({
        readUrl: async () => 'https://processed.example.test/image.webp',
      })
      .overrideGuard(RequestRateGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication({
      bodyParser: false,
      logger: false,
    });
    configureApp(app, config);
    let origin = '';
    let tokens: {
      seller: string;
      buyer: string;
      moderator: string;
      admin: string;
    };
    const request = (
      path: string,
      token: string,
      method = 'GET',
      body?: object,
      version?: number,
    ) =>
      fetch(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(version ? { 'if-match': `"${version}"` } : {}),
          'x-request-id': 'moderation-integration',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const expectCode = async (
      response: Response,
      status: number,
      code: string,
    ) => {
      const value: unknown = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      assert.ok(value && typeof value === 'object' && 'code' in value);
      assert.equal(value.code, code);
    };
    try {
      await app.listen(0, '127.0.0.1');
      origin = await app.getUrl();
      const signer = app.get(AuthTokens);
      tokens = {
        seller: await signer.issue({
          userId: fixture.seller,
          sessionId: sessions.seller,
          roles: ['USER'],
        }),
        buyer: await signer.issue({
          userId: fixture.buyer,
          sessionId: sessions.buyer,
          roles: ['USER'],
        }),
        moderator: await signer.issue({
          userId: fixture.moderator,
          sessionId: sessions.moderator,
          roles: ['USER', 'MODERATOR'],
        }),
        admin: await signer.issue({
          userId: adminId,
          sessionId: sessions.admin,
          roles: ['USER', 'ADMIN'],
        }),
      };

      await t.test(
        'role matrix and compact Cars + Parts queue are enforced',
        async () => {
          await expectCode(
            await request('moderation/listings', tokens.seller),
            403,
            'FORBIDDEN',
          );
          const response = await request(
            'moderation/listings?limit=2',
            tokens.moderator,
          );
          assert.equal(response.status, 200);
          const page = (await response.json()) as {
            items: Array<Record<string, unknown>>;
            page: { nextCursor: string };
          };
          assert.equal(page.items.length, 2);
          assert.deepEqual(
            page.items.map((item) => item.type),
            ['VEHICLE', 'PART'],
          );
          assert.equal(JSON.stringify(page).includes('vin'), false);
          assert.equal(JSON.stringify(page).includes('exactPoint'), false);
          assert.ok(page.page.nextCursor);
          const next = await request(
            `moderation/listings?limit=2&cursor=${encodeURIComponent(page.page.nextCursor)}`,
            tokens.moderator,
          );
          assert.equal(next.status, 200);
        },
      );

      await t.test(
        'vehicle approval rechecks invariants, publishes and exposes only privileged detail',
        async () => {
          const detail = await request(
            `moderation/listings/${carId}`,
            tokens.moderator,
          );
          assert.equal(detail.status, 200);
          const before = (await detail.json()) as {
            vehicle: { vin: string };
            location: { exactPoint: object };
            version: number;
          };
          assert.equal(before.vehicle.vin, 'WBA8A9C50GK123456');
          assert.ok(before.location.exactPoint);
          const approved = await request(
            `moderation/listings/${carId}/approve`,
            tokens.moderator,
            'POST',
            {},
            before.version,
          );
          assert.equal(approved.status, 200);
          const value = (await approved.json()) as {
            status: string;
            publishedAt: string;
            version: number;
          };
          assert.equal(value.status, 'PUBLISHED');
          assert.ok(value.publishedAt);
          const search = await fetch(
            `${origin}/api/v1/listings?type=VEHICLE&limit=50`,
          );
          assert.equal(search.status, 200);
          assert.equal(
            JSON.stringify(await search.json()).includes(carId),
            true,
          );
          await expectCode(
            await request(
              `moderation/listings/${carId}/approve`,
              tokens.moderator,
              'POST',
              {},
              value.version,
            ),
            409,
            'MODERATION_INVALID_STATE',
          );
        },
      );

      await t.test(
        'concurrent approve/reject has one winner and one version conflict',
        async () => {
          const [approve, reject] = await Promise.all([
            request(
              `moderation/listings/${raceId}/approve`,
              tokens.moderator,
              'POST',
              {},
              1,
            ),
            request(
              `moderation/listings/${raceId}/reject`,
              tokens.admin,
              'POST',
              { reasonCode: 'OTHER', sellerMessage: 'Needs review.' },
              1,
            ),
          ]);
          assert.deepEqual([approve.status, reject.status].sort(), [200, 409]);
          const failed = approve.status === 409 ? approve : reject;
          const body = (await failed.json()) as { code: string };
          assert.equal(body.code, 'MODERATION_VERSION_CONFLICT');
        },
      );

      await t.test(
        'part reject is seller-safe, editable, resubmittable and approvable',
        async () => {
          const rejected = await request(
            `moderation/listings/${partListingId}/reject`,
            tokens.moderator,
            'POST',
            {
              reasonCode: 'WRONG_CATEGORY',
              sellerMessage: 'Choose the correct category.',
              internalNote: 'Internal investigation marker',
            },
            1,
          );
          assert.equal(rejected.status, 200);
          const sellerResult = await request(
            `me/listings/${partListingId}/moderation-result`,
            tokens.seller,
          );
          const sellerBody = await sellerResult.text();
          assert.equal(sellerResult.status, 200);
          assert.equal(
            sellerBody.includes('Choose the correct category.'),
            true,
          );
          assert.equal(
            sellerBody.includes('Internal investigation marker'),
            false,
          );
          assert.equal(sellerBody.includes(fixture.moderator), false);
          await expectCode(
            await request(
              `moderation/listings/${partListingId}/approve`,
              tokens.admin,
              'POST',
              {},
              2,
            ),
            409,
            'MODERATION_INVALID_STATE',
          );
          const edited = await request(
            `me/part-listings/${partListingId}`,
            tokens.seller,
            'PATCH',
            { listing: { description: 'Corrected part details' } },
            2,
          );
          assert.equal(edited.status, 200);
          const editBody = (await edited.json()) as { version: number };
          const submitted = await request(
            `me/listings/${partListingId}/submit`,
            tokens.seller,
            'POST',
            {},
            editBody.version,
          );
          assert.equal(submitted.status, 200);
          const submitBody = (await submitted.json()) as { version: number };
          assert.equal(
            (
              await request(
                `moderation/listings/${partListingId}/approve`,
                tokens.admin,
                'POST',
                {},
                submitBody.version,
              )
            ).status,
            200,
          );
        },
      );

      await t.test(
        'reports validate self/duplicates and bound message context',
        async () => {
          await expectCode(
            await request('reports', tokens.seller, 'POST', {
              targetType: 'LISTING',
              targetId: carId,
              reason: 'OTHER',
            }),
            400,
            'REPORT_SELF_TARGET',
          );
          await expectCode(
            await request('reports', tokens.buyer, 'POST', {
              targetType: 'LISTING',
              targetId: fixture.missing,
              reason: 'SCAM',
            }),
            404,
            'REPORT_INVALID_TARGET',
          );
          const created = await request('reports', tokens.buyer, 'POST', {
            targetType: 'LISTING',
            targetId: carId,
            reason: 'MISLEADING_INFORMATION',
            details: 'Price mismatch',
          });
          assert.equal(created.status, 201);
          await expectCode(
            await request('reports', tokens.buyer, 'POST', {
              targetType: 'LISTING',
              targetId: carId,
              reason: 'SCAM',
            }),
            409,
            'REPORT_DUPLICATE',
          );
          assert.equal(
            (
              await request('reports', tokens.buyer, 'POST', {
                targetType: 'USER',
                targetId: fixture.seller,
                reason: 'SCAM',
              })
            ).status,
            201,
          );
          const message = await request('reports', tokens.seller, 'POST', {
            targetType: 'MESSAGE',
            targetId: fixture.message,
            reason: 'HARASSMENT',
          });
          assert.equal(message.status, 201);
          const messageReport = (await message.json()) as { id: string };
          const detail = await request(
            `moderation/reports/${messageReport.id}`,
            tokens.moderator,
          );
          assert.equal(detail.status, 200);
          const body = await detail.text();
          assert.equal(body.includes('Is this vehicle available?'), true);
          assert.equal(body.includes('password'), false);

          const resolutions = await Promise.all([
            request(
              `moderation/reports/${messageReport.id}/resolve`,
              tokens.moderator,
              'POST',
              {
                outcome: 'RESOLVED',
                resolution: 'WARNING',
                note: 'Reviewed by moderator',
              },
            ),
            request(
              `moderation/reports/${messageReport.id}/resolve`,
              tokens.admin,
              'POST',
              {
                outcome: 'RESOLVED',
                resolution: 'WARNING',
                note: 'Reviewed by administrator',
              },
            ),
          ]);
          assert.deepEqual(
            resolutions.map((response) => response.status).sort(),
            [200, 409],
          );
          const loser = resolutions.find((response) => response.status === 409);
          assert.ok(loser);
          assert.equal(
            ((await loser.json()) as { code: string }).code,
            'REPORT_ALREADY_RESOLVED',
          );

          const firstQueueResponse = await request(
            'moderation/reports?status=OPEN&limit=2',
            tokens.moderator,
          );
          assert.equal(
            firstQueueResponse.status,
            200,
            await firstQueueResponse.clone().text(),
          );
          const firstQueue = (await firstQueueResponse.json()) as {
            items: Array<{ id: string }>;
            page: { nextCursor: string | null };
          };
          assert.ok(firstQueue.page.nextCursor);
          assert.equal(
            firstQueue.items.some((item) => item.id === messageReport.id),
            false,
          );
          const secondQueue = (await (
            await request(
              `moderation/reports?status=OPEN&limit=2&cursor=${encodeURIComponent(firstQueue.page.nextCursor)}`,
              tokens.moderator,
            )
          ).json()) as { items: Array<{ id: string }> };
          assert.equal(
            secondQueue.items.some((item) =>
              firstQueue.items.some((first) => first.id === item.id),
            ),
            false,
          );
        },
      );

      await t.test(
        'report content removal is atomic and removes listing from Search/Map',
        async () => {
          const conversationId = randomUUID();
          await source.query(
            'INSERT INTO conversations(id, listing_id, buyer_id) VALUES ($1, $2, $3)',
            [conversationId, carId, fixture.buyer],
          );
          await source.query(
            'INSERT INTO conversation_participants(conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
            [conversationId, fixture.seller, fixture.buyer],
          );
          const queue = await request(
            'moderation/reports?status=OPEN&targetType=LISTING',
            tokens.moderator,
          );
          const page = (await queue.json()) as {
            items: Array<{ id: string; targetId: string }>;
          };
          const report = page.items.find((item) => item.targetId === carId);
          assert.ok(report);
          const resolved = await request(
            `moderation/reports/${report.id}/resolve`,
            tokens.moderator,
            'POST',
            {
              outcome: 'RESOLVED',
              resolution: 'CONTENT_REMOVED',
              targetVersion: 2,
              note: 'Confirmed violation',
            },
          );
          assert.equal(resolved.status, 200, await resolved.clone().text());
          const search = await fetch(
            `${origin}/api/v1/listings?type=VEHICLE&limit=50`,
          );
          assert.equal(
            JSON.stringify(await search.json()).includes(carId),
            false,
          );
          const map = await fetch(
            `${origin}/api/v1/search/listings/map?type=VEHICLE&bbox=4,51,6,53`,
          );
          assert.equal(map.status, 200);
          assert.equal(JSON.stringify(await map.json()).includes(carId), false);
          const archivedDetail = await request(
            `moderation/listings/${carId}`,
            tokens.moderator,
          );
          const archived = (await archivedDetail.json()) as {
            status: string;
            version: number;
          };
          assert.equal(archived.status, 'ARCHIVED');
          const conversation = await request(
            `me/conversations/${conversationId}`,
            tokens.buyer,
          );
          assert.equal(conversation.status, 200);
          assert.equal(
            ((await conversation.json()) as { canSend: boolean }).canSend,
            false,
          );
          await expectCode(
            await request(
              `me/conversations/${conversationId}/messages`,
              tokens.buyer,
              'POST',
              {
                clientMessageId: randomUUID(),
                body: 'This must remain read-only after moderator removal',
              },
            ),
            409,
            'CONVERSATION_READ_ONLY',
          );
          assert.equal(
            (
              await request(
                `me/conversations/${conversationId}/messages`,
                tokens.buyer,
              )
            ).status,
            200,
          );
          await expectCode(
            await request(
              `moderation/listings/${carId}/approve`,
              tokens.moderator,
              'POST',
              {},
              archived.version,
            ),
            409,
            'MODERATION_INVALID_STATE',
          );
        },
      );

      await t.test(
        'admin actions revoke sessions, role checks persist and protect the last admin',
        async () => {
          await expectCode(
            await request('admin/users', tokens.moderator),
            403,
            'FORBIDDEN',
          );
          assert.equal(
            (await request('admin/users?role=USER', tokens.admin)).status,
            200,
          );
          const firstUsersPage = (await (
            await request('admin/users?limit=2', tokens.admin)
          ).json()) as {
            items: Array<{ id: string }>;
            page: { nextCursor: string | null };
          };
          assert.ok(firstUsersPage.page.nextCursor);
          const secondUsersPage = (await (
            await request(
              `admin/users?limit=2&cursor=${encodeURIComponent(firstUsersPage.page.nextCursor)}`,
              tokens.admin,
            )
          ).json()) as { items: Array<{ id: string }> };
          assert.equal(
            secondUsersPage.items.some((item) =>
              firstUsersPage.items.some((first) => first.id === item.id),
            ),
            false,
          );
          const suspended = await request(
            `admin/users/${fixture.buyer}/suspend`,
            tokens.admin,
            'POST',
            {
              expectedStatus: 'ACTIVE',
              reasonCode: 'ADMINISTRATIVE_REVIEW',
              note: 'Temporary review',
            },
          );
          assert.equal(suspended.status, 200);
          const sessionsRows: { revoked_at: Date | null }[] =
            await source.query(
              'SELECT revoked_at FROM user_sessions WHERE id = $1',
              [sessions.buyer],
            );
          assert.ok(sessionsRows[0]?.revoked_at);
          await expectCode(
            await request('auth/me', tokens.buyer),
            403,
            'ACCOUNT_SUSPENDED',
          );
          assert.equal(
            (
              await request(
                `admin/users/${fixture.buyer}/reactivate`,
                tokens.admin,
                'POST',
                {
                  expectedStatus: 'SUSPENDED',
                  reasonCode: 'ADMINISTRATIVE_REVIEW',
                  note: 'Review complete',
                },
              )
            ).status,
            200,
          );
          const roleChange = await request(
            `admin/users/${fixture.buyer}/roles`,
            tokens.admin,
            'PUT',
            { expectedRoles: ['USER'], roles: ['USER', 'MODERATOR'] },
          );
          assert.equal(roleChange.status, 200);

          const roleSessionId = randomUUID();
          await source.query(
            'INSERT INTO user_sessions(id,user_id,expires_at,last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
            [roleSessionId, fixture.buyer, '2100-01-01T00:00:00Z'],
          );
          const moderatorAfterGrant = await signer.issue({
            userId: fixture.buyer,
            sessionId: roleSessionId,
            roles: ['USER'],
          });
          assert.equal(
            (await request('moderation/listings?limit=1', moderatorAfterGrant))
              .status,
            200,
          );
          assert.equal(
            (
              await request(
                `admin/users/${fixture.buyer}/roles`,
                tokens.admin,
                'PUT',
                {
                  expectedRoles: ['USER', 'MODERATOR'],
                  roles: ['USER'],
                },
              )
            ).status,
            200,
          );
          await expectCode(
            await request('moderation/listings?limit=1', moderatorAfterGrant),
            403,
            'FORBIDDEN',
          );
          assert.equal(
            (
              await request(
                `admin/users/${fixture.buyer}/roles`,
                tokens.admin,
                'PUT',
                {
                  expectedRoles: ['USER'],
                  roles: ['USER', 'MODERATOR'],
                },
              )
            ).status,
            200,
          );

          assert.equal(
            (
              await request(
                `admin/users/${fixture.buyer}/block`,
                tokens.admin,
                'POST',
                {
                  expectedStatus: 'ACTIVE',
                  reasonCode: 'FRAUD_RISK',
                  note: 'Publication eligibility review',
                },
              )
            ).status,
            200,
          );
          await expectCode(
            await request(
              `moderation/listings/${blockedListingId}/approve`,
              tokens.moderator,
              'POST',
              {},
              1,
            ),
            409,
            'MODERATION_SELLER_INELIGIBLE',
          );
          assert.equal(
            (
              await request(
                `admin/users/${fixture.buyer}/reactivate`,
                tokens.admin,
                'POST',
                {
                  expectedStatus: 'BLOCKED',
                  reasonCode: 'ADMINISTRATIVE_REVIEW',
                  note: 'Eligibility review complete',
                },
              )
            ).status,
            200,
          );
          assert.equal(
            (await request('moderation/listings?limit=1', moderatorAfterGrant))
              .status,
            401,
          );
          await source.query(
            "UPDATE listings SET status='DRAFT', submitted_at=NULL WHERE id=$1",
            [blockedListingId],
          );
          await expectCode(
            await request(
              `moderation/listings/${blockedListingId}/approve`,
              tokens.moderator,
              'POST',
              {},
              1,
            ),
            409,
            'MODERATION_INVALID_STATE',
          );
          await expectCode(
            await request(`admin/users/${adminId}/roles`, tokens.admin, 'PUT', {
              expectedRoles: ['USER', 'ADMIN'],
              roles: ['USER'],
            }),
            409,
            'SELF_ADMIN_ACTION_FORBIDDEN',
          );
          const audit = await request(
            'admin/audit?action=USER_ROLES_CHANGED',
            tokens.admin,
          );
          const text = await audit.text();
          assert.equal(audit.status, 200);
          assert.equal(text.includes('USER_ROLES_CHANGED'), true);
          for (const secret of [
            'password_hash',
            'token_hash',
            'authorization',
            'cookie',
          ])
            assert.equal(text.toLowerCase().includes(secret), false);

          const auditPage = (await (
            await request('admin/audit?limit=1', tokens.admin)
          ).json()) as {
            items: Array<{ id: string }>;
            page: { nextCursor: string | null };
          };
          assert.ok(auditPage.page.nextCursor);
          const nextAuditPage = (await (
            await request(
              `admin/audit?limit=1&cursor=${encodeURIComponent(auditPage.page.nextCursor)}`,
              tokens.admin,
            )
          ).json()) as { items: Array<{ id: string }> };
          assert.notEqual(nextAuditPage.items[0]?.id, auditPage.items[0]?.id);

          assert.equal(
            (
              await request(
                `admin/users/${fixture.buyer}/roles`,
                tokens.admin,
                'PUT',
                {
                  expectedRoles: ['USER', 'MODERATOR'],
                  roles: ['USER', 'MODERATOR', 'ADMIN'],
                },
              )
            ).status,
            200,
          );
          const secondAdminSession = randomUUID();
          await source.query(
            'INSERT INTO user_sessions(id,user_id,expires_at,last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
            [secondAdminSession, fixture.buyer, '2100-01-01T00:00:00Z'],
          );
          const secondAdmin = await signer.issue({
            userId: fixture.buyer,
            sessionId: secondAdminSession,
            roles: ['USER', 'MODERATOR', 'ADMIN'],
          });
          const lastAdminRace = await Promise.all([
            request(`admin/users/${fixture.buyer}/roles`, tokens.admin, 'PUT', {
              expectedRoles: ['USER', 'MODERATOR', 'ADMIN'],
              roles: ['USER', 'MODERATOR'],
            }),
            request(`admin/users/${adminId}/roles`, secondAdmin, 'PUT', {
              expectedRoles: ['USER', 'ADMIN'],
              roles: ['USER'],
            }),
          ]);
          assert.deepEqual(
            lastAdminRace.map((response) => response.status).sort(),
            [200, 409],
          );
          const protectedResponse = lastAdminRace.find(
            (response) => response.status === 409,
          );
          assert.ok(protectedResponse);
          assert.equal(
            ((await protectedResponse.json()) as { code: string }).code,
            'LAST_ADMIN_PROTECTION',
          );
          const activeAdmins: { count: number }[] = await source.query(
            `SELECT COUNT(*)::integer count FROM user_roles role JOIN users "user" ON "user".id=role.user_id WHERE role.role='ADMIN' AND "user".status='ACTIVE'`,
          );
          assert.equal(activeAdmins[0]?.count, 1);

          const notifications: { count: number }[] = await source.query(
            "SELECT COUNT(*)::integer count FROM notifications WHERE type IN ('MODERATION_RESULT','ACCOUNT_STATUS_CHANGED')",
          );
          assert.ok((notifications[0]?.count ?? 0) >= 6);
        },
      );

      await t.test(
        'OpenAPI publishes protected moderation/admin contracts and mutation schemas',
        async () => {
          const response = await fetch(`${origin}/api/docs-json`);
          assert.equal(response.status, 200);
          const document = (await response.json()) as {
            paths: Record<
              string,
              Record<
                string,
                {
                  security?: Array<Record<string, unknown>>;
                  parameters?: Array<{ name?: string }>;
                  requestBody?: unknown;
                }
              >
            >;
          };
          const expected = [
            ['/api/v1/reports', 'post'],
            ['/api/v1/moderation/listings', 'get'],
            ['/api/v1/moderation/listings/{id}', 'get'],
            ['/api/v1/moderation/listings/{id}/approve', 'post'],
            ['/api/v1/moderation/listings/{id}/reject', 'post'],
            ['/api/v1/moderation/listings/{id}/remove', 'post'],
            ['/api/v1/moderation/reports', 'get'],
            ['/api/v1/moderation/reports/{id}', 'get'],
            ['/api/v1/moderation/reports/{id}/resolve', 'post'],
            ['/api/v1/admin/users', 'get'],
            ['/api/v1/admin/users/{id}', 'get'],
            ['/api/v1/admin/users/{id}/suspend', 'post'],
            ['/api/v1/admin/users/{id}/block', 'post'],
            ['/api/v1/admin/users/{id}/reactivate', 'post'],
            ['/api/v1/admin/users/{id}/roles', 'put'],
            ['/api/v1/admin/audit', 'get'],
          ] as const;
          for (const [path, method] of expected) {
            const operation = document.paths[path]?.[method];
            assert.ok(operation, `${method.toUpperCase()} ${path}`);
            assert.equal(
              JSON.stringify(operation.security).includes('bearer'),
              true,
            );
          }
          assert.ok(document.paths['/api/v1/reports']?.post?.requestBody);
          assert.ok(
            document.paths['/api/v1/admin/users/{id}/roles']?.put?.requestBody,
          );
          assert.equal(
            document.paths[
              '/api/v1/moderation/listings/{id}/approve'
            ]?.post?.parameters?.some(
              (parameter) => parameter.name === 'If-Match',
            ),
            true,
          );
        },
      );
    } finally {
      await app.close();
      await database.close();
    }
  },
);
