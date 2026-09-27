import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { QueryFailedError } from 'typeorm';
import type { DataSource } from 'typeorm';
import { createSchemaDatabase } from '../support/schema-database';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';
import { seedVehicleCatalog } from '../../src/modules/vehicles/infrastructure/persistence/catalog.seed';
import { User } from '../../src/modules/users/infrastructure/persistence/user.entity';
import { UserCredential } from '../../src/modules/auth/infrastructure/persistence/user-credential.entity';
import { SessionToken } from '../../src/modules/auth/infrastructure/persistence/session-token.entity';
import { Vehicle } from '../../src/modules/vehicles/infrastructure/persistence/vehicle.entity';
import { Listing } from '../../src/modules/listings/infrastructure/persistence/listing.entity';
import { VehicleListing } from '../../src/modules/listings/infrastructure/persistence/vehicle-listing.entity';
import { ListingLocation } from '../../src/modules/geo/infrastructure/persistence/listing-location.entity';
import { ListingPersistence } from '../../src/modules/listings';
import { AuditLog } from '../../src/modules/audit/infrastructure/persistence/audit-log.entity';
import { AuditWriter } from '../../src/modules/audit';

const tables = [
  'users',
  'user_roles',
  'user_credentials',
  'user_sessions',
  'session_tokens',
  'vehicle_makes',
  'vehicle_models',
  'vehicle_generations',
  'vehicles',
  'listings',
  'listing_locations',
  'listing_media',
  'favorites',
  'saved_searches',
  'conversations',
  'conversation_participants',
  'messages',
  'notifications',
  'notification_preferences',
  'notification_deliveries',
  'reports',
  'moderation_actions',
  'audit_logs',
  'outbox_events',
];

async function rejectsDatabase(
  source: DataSource,
  sql: string,
  parameters: unknown[],
  code: string,
  constraint?: string,
): Promise<void> {
  await assert.rejects(
    () => source.query(sql, parameters),
    (error: unknown) => {
      if (!(error instanceof QueryFailedError)) return false;
      const driver: unknown = error.driverError;
      if (typeof driver !== 'object' || driver === null || !('code' in driver))
        return false;
      return (
        driver.code === code &&
        (!constraint ||
          ('constraint' in driver && driver.constraint === constraint))
      );
    },
  );
}

test(
  'marketplace persistence on an owned empty PostgreSQL/PostGIS database',
  { timeout: 120000 },
  async (t) => {
    const database = await createSchemaDatabase();
    const { source } = database;
    try {
      await t.test(
        'clean apply, repeat, index/auth/schema rollbacks and reapply preserve PostGIS and migration history',
        async () => {
          const before: { count: string }[] = await source.query(
            "SELECT count(*) FROM pg_extension WHERE extname = 'postgis'",
          );
          assert.equal(before[0]?.count, '0');
          const applied = await source.runMigrations();
          assert.deepEqual(
            applied.map((migration) => migration.name),
            [
              'EnablePostgis1789590000000',
              'MarketplaceSchema1789600000000',
              'Authentication1789610000000',
              'ListingSellerUpdatedIndex1789700000000',
              'MediaWorkflow1789800000000',
              'PublicLocationSearchIndex1789900000000',
              'MarketplaceListingSubtypes1790000000000',
              'ModerationWorkflow1790100000000',
              'EngagementOutbox1790200000000',
              'MessagingRealtime1790300000000',
              'AccountEmailDelivery1790400000000',
              'MessagingModerationReadOnly1790500000000',
            ],
          );
          assert.deepEqual(await source.runMigrations(), []);
          await source.undoLastMigration();
          const moderationMessagingRollback: { column_name: string }[] =
            await source.query(
              "SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name='send_disabled_at'",
            );
          assert.equal(moderationMessagingRollback.length, 0);
          assert.equal((await source.runMigrations()).length, 1);
          await source.undoLastMigration();
          await source.undoLastMigration();
          const accountRollback: { deliveries: string | null }[] =
            await source.query(
              "SELECT to_regclass('notification_deliveries')::text AS deliveries",
            );
          assert.equal(accountRollback[0]?.deliveries, null);
          assert.equal((await source.runMigrations()).length, 2);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          const messagingRollback: { column_name: string }[] =
            await source.query(
              "SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name='buyer_id'",
            );
          assert.equal(messagingRollback.length, 0);
          assert.equal((await source.runMigrations()).length, 3);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          const engagementRollback: { relation: string | null }[] =
            await source.query(
              "SELECT to_regclass('outbox_events')::text AS relation",
            );
          assert.equal(engagementRollback[0]?.relation, null);
          assert.equal((await source.runMigrations()).length, 4);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          const moderationRollback: { index: string | null }[] =
            await source.query(
              "SELECT to_regclass('ix_reports_status_queue')::text AS index",
            );
          assert.equal(moderationRollback[0]?.index, null);
          assert.equal((await source.runMigrations()).length, 5);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          const searchRollback: { index: string | null }[] = await source.query(
            "SELECT to_regclass('ix_listing_locations_public_point')::text AS index",
          );
          assert.equal(searchRollback[0]?.index, null);
          assert.equal((await source.runMigrations()).length, 7);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          const mediaRollback: { relation: string | null }[] =
            await source.query(
              "SELECT to_regclass('listing_media_variants')::text AS relation",
            );
          assert.equal(mediaRollback[0]?.relation, null);
          assert.equal((await source.runMigrations()).length, 8);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          const indexRollback: { index: string | null }[] = await source.query(
            "SELECT to_regclass('ix_listings_seller_updated')::text AS index",
          );
          assert.equal(indexRollback[0]?.index, null);
          assert.equal((await source.runMigrations()).length, 9);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          const authRollback: {
            relation: string | null;
            users: string | null;
          }[] = await source.query(
            "SELECT to_regclass('auth_action_tokens')::text AS relation, to_regclass('users')::text AS users",
          );
          assert.equal(authRollback[0]?.relation, null);
          assert.equal(authRollback[0]?.users, 'users');
          assert.equal((await source.runMigrations()).length, 10);
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          await source.undoLastMigration();
          for (const table of tables) {
            const rows: { relation: string | null }[] = await source.query(
              'SELECT to_regclass($1)::text AS relation',
              [table],
            );
            assert.equal(rows[0]?.relation, null, table);
          }
          const journal: { count: string }[] = await source.query(
            'SELECT count(*) FROM migrations',
          );
          assert.equal(journal[0]?.count, '1');
          await source.undoLastMigration();
          const version: { version: string }[] = await source.query(
            'SELECT PostGIS_Version() AS version',
          );
          assert.equal(typeof version[0]?.version, 'string');
          assert.equal((await source.runMigrations()).length, 12);
          assert.deepEqual(await source.runMigrations(), []);
        },
      );

      await t.test(
        'actual tables, columns, constraints and ORM metadata agree',
        async () => {
          const relations: { table_name: string }[] = await source.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
          );
          for (const table of tables)
            assert.ok(
              relations.some((row) => row.table_name === table),
              table,
            );
          assert.equal(source.entityMetadatas.length, 32);
          const schemaChanges = await source.driver.createSchemaBuilder().log();
          assert.deepEqual(
            schemaChanges.upQueries.map((query) => query.query),
            [],
          );
          const columns: {
            table_name: string;
            column_name: string;
            data_type: string;
            is_nullable: string;
          }[] = await source.query(
            "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public'",
          );
          assert.equal(
            columns.find(
              (column) =>
                column.table_name === 'listings' &&
                column.column_name === 'price_minor',
            )?.data_type,
            'bigint',
          );
          assert.equal(
            columns.find(
              (column) =>
                column.table_name === 'vehicles' &&
                column.column_name === 'generation_id',
            )?.is_nullable,
            'YES',
          );
          for (const column of columns.filter((column) =>
            /(_at)$/.test(column.column_name),
          ))
            assert.equal(
              column.data_type,
              'timestamp with time zone',
              `${column.table_name}.${column.column_name}`,
            );
          const constraints: { conname: string; contype: string }[] =
            await source.query(
              "SELECT conname, contype FROM pg_constraint WHERE connamespace = 'public'::regnamespace",
            );
          for (const name of [
            'uq_users_email_normalized',
            'ck_listings_price',
            'ck_vehicles_mileage',
            'fk_vehicles_generation_model',
            'fk_messages_sender_participant',
            'ck_reports_target',
            'fk_audit_logs_actor',
            'ck_notification_deliveries_status',
            'ck_notification_deliveries_payload',
          ])
            assert.ok(
              constraints.some((constraint) => constraint.conname === name),
              name,
            );
          const timezone: { TimeZone: string }[] =
            await source.query('SHOW TimeZone');
          assert.equal(timezone[0]?.TimeZone, 'UTC');
        },
      );

      await t.test(
        'real indexes include GiST, expression GiST and partial unique predicates',
        async () => {
          const indexes: { indexname: string; indexdef: string }[] =
            await source.query(
              "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'",
            );
          const index = (name: string): string => {
            const definition = indexes.find(
              (row) => row.indexname === name,
            )?.indexdef;
            assert.ok(definition, name);
            return definition;
          };
          assert.match(
            index('ix_listing_locations_point'),
            /USING gist \(point\)/,
          );
          assert.match(
            index('ix_listing_locations_geography'),
            /USING gist.*geography/,
          );
          assert.match(
            index('uq_listing_media_primary'),
            /UNIQUE.*WHERE \(is_primary = true\)/,
          );
          assert.match(
            index('uq_session_tokens_live'),
            /UNIQUE.*consumed_at IS NULL.*revoked_at IS NULL/,
          );
          assert.match(
            index('ix_listings_published_newest'),
            /published_at, id.*WHERE.*PUBLISHED/,
          );
          assert.match(
            index('ix_listings_published_price'),
            /currency, price_minor, id.*WHERE.*PUBLISHED/,
          );
          assert.match(
            index('ix_listings_moderation_queue'),
            /submitted_at, id.*PENDING_MODERATION/,
          );
          assert.match(
            index('ix_messages_conversation_cursor'),
            /conversation_id, created_at, id/,
          );
          assert.match(
            index('ix_notifications_user_unread'),
            /user_id, created_at, id.*read_at IS NULL/,
          );
        },
      );

      await t.test(
        'seed is repeatable and related marketplace records persist through ORM and SQL',
        async () => {
          await seedMarketplaceFixture(source);
          await source.transaction(seedVehicleCatalog);
          for (const [table, expected] of [
            ['vehicle_makes', '5'],
            ['vehicle_models', '6'],
            ['vehicle_generations', '6'],
          ]) {
            const counts: { count: string }[] = await source.query(
              `SELECT count(*) FROM ${table}`,
            );
            assert.equal(counts[0]?.count, expected);
          }
          for (const table of tables) {
            const counts: { count: string }[] = await source.query(
              `SELECT count(*) FROM ${table}`,
            );
            if (
              table === 'notification_preferences' ||
              table === 'notification_deliveries'
            )
              assert.equal(counts[0]?.count, '0', table);
            else assert.ok(Number(counts[0]?.count) > 0, table);
          }
          const listing = await source.getRepository(Listing).findOneOrFail({
            where: { id: fixture.listings[0] },
            relations: { seller: true },
          });
          const link = await source.manager.findOneByOrFail(VehicleListing, {
            listingId: listing.id,
          });
          const vehicle = await source.getRepository(Vehicle).findOneOrFail({
            where: { id: link.vehicleId },
            relations: { model: { make: true } },
          });
          assert.equal(vehicle.model.make.name, 'BMW');
          assert.equal(listing.seller.id, fixture.seller);
          assert.equal(listing.priceMinor, '9007199254740993');
          assert.equal(listing.version, 1);
        },
      );

      await t.test(
        'normalized email and role assignments are unique; unexpected statuses fail',
        async () => {
          await rejectsDatabase(
            source,
            'INSERT INTO users(email_normalized, display_name) VALUES ($1, $2)',
            ['seller@example.test', 'Duplicate'],
            '23505',
            'uq_users_email_normalized',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO users(email_normalized, display_name) VALUES ($1, $2)',
            [' Seller@Example.Test ', 'Unnormalized'],
            '23514',
            'ck_users_email_normalized',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO user_roles(user_id, role) VALUES ($1, $2)',
            [fixture.seller, 'USER'],
            '23505',
          );
          await rejectsDatabase(
            source,
            'UPDATE users SET status = $1 WHERE id = $2',
            ['UNKNOWN', fixture.seller],
            '23514',
            'ck_users_status',
          );
          await rejectsDatabase(
            source,
            'UPDATE listings SET status = $1 WHERE id = $2',
            ['UNKNOWN', fixture.listings[0]],
            '23514',
            'ck_listings_status',
          );
        },
      );

      await t.test(
        'favorite, primary photo, position and storage key cannot duplicate',
        async () => {
          await rejectsDatabase(
            source,
            "INSERT INTO favorites(user_id, listing_id, listing_type) VALUES ($1, $2, 'VEHICLE')",
            [fixture.buyer, fixture.listings[0]],
            '23505',
          );
          await rejectsDatabase(
            source,
            "INSERT INTO listing_media(listing_id, storage_key, sort_order, is_primary, status) VALUES ($1, $2, 2, true, 'READY')",
            [fixture.listings[0], 'fixtures/duplicate-primary.jpg'],
            '23505',
            'uq_listing_media_primary',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO listing_media(listing_id, storage_key, sort_order) VALUES ($1, $2, 0)',
            [fixture.listings[0], 'fixtures/duplicate-position.jpg'],
            '23505',
            'uq_listing_media_position',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO listing_media(listing_id, storage_key, sort_order) VALUES ($1, $2, 2)',
            [
              fixture.listings[0],
              `listings/${fixture.listings[0]}/fixture-1.jpg`,
            ],
            '23505',
            'uq_listing_media_storage_key',
          );
          for (const key of [
            '../private.jpg',
            '/private.jpg',
            'safe/../../private.jpg',
            'https://example.test/image.jpg',
          ])
            await rejectsDatabase(
              source,
              'INSERT INTO listing_media(listing_id, storage_key, sort_order) VALUES ($1, $2, 2)',
              [fixture.listings[0], key],
              '23514',
              'ck_listing_media_key',
            );
        },
      );

      await t.test(
        'numeric, currency, VIN and lifecycle invariants reject corrupt values',
        async () => {
          await rejectsDatabase(
            source,
            'UPDATE vehicles SET mileage_km = -1 WHERE id = $1',
            [fixture.vehicles[0]],
            '23514',
            'ck_vehicles_mileage',
          );
          await rejectsDatabase(
            source,
            'UPDATE listings SET price_minor = -1 WHERE id = $1',
            [fixture.listings[0]],
            '23514',
            'ck_listings_price',
          );
          await rejectsDatabase(
            source,
            'UPDATE listings SET currency = $1 WHERE id = $2',
            ['eur', fixture.listings[0]],
            '23514',
            'ck_listings_currency',
          );
          await rejectsDatabase(
            source,
            'UPDATE vehicles SET year = 10 WHERE id = $1',
            [fixture.vehicles[0]],
            '23514',
            'ck_vehicles_year',
          );
          await rejectsDatabase(
            source,
            'UPDATE vehicles SET engine_power_hp = 0 WHERE id = $1',
            [fixture.vehicles[0]],
            '23514',
            'ck_vehicles_engine',
          );
          await rejectsDatabase(
            source,
            'UPDATE vehicles SET engine_displacement_cc = -1 WHERE id = $1',
            [fixture.vehicles[0]],
            '23514',
            'ck_vehicles_engine',
          );
          await rejectsDatabase(
            source,
            'UPDATE vehicles SET vin = $1 WHERE id = $2',
            ['wba8a9c50gk123456', fixture.vehicles[0]],
            '23514',
            'ck_vehicles_vin',
          );
          await rejectsDatabase(
            source,
            'UPDATE listings SET published_at = NULL WHERE id = $1',
            [fixture.listings[0]],
            '23514',
            'ck_listings_lifecycle',
          );
          await rejectsDatabase(
            source,
            'UPDATE listings SET status = $1, sold_at = NULL WHERE id = $2',
            ['SOLD', fixture.listings[0]],
            '23514',
            'ck_listings_lifecycle',
          );
          // The same VIN on later observations is intentional, not a global identity claim.
          const repeated: { count: string }[] = await source.query(
            'SELECT count(*) FROM vehicles WHERE vin = $1',
            ['WBA8A9C50GK123456'],
          );
          assert.equal(repeated[0]?.count, '3');
        },
      );

      await t.test(
        'seller, vehicle, model, generation and listing foreign keys are authoritative',
        async () => {
          await rejectsDatabase(
            source,
            'UPDATE listings SET seller_id = $1 WHERE id = $2',
            [fixture.missing, fixture.listings[0]],
            '23503',
            'fk_listings_seller',
          );
          await rejectsDatabase(
            source,
            'UPDATE vehicle_listings SET vehicle_id = $1 WHERE listing_id = $2',
            [fixture.missing, fixture.listings[0]],
            '23503',
            'fk_vehicle_listings_vehicle',
          );
          await rejectsDatabase(
            source,
            'UPDATE vehicles SET model_id = $1, generation_id = NULL WHERE id = $2',
            [fixture.missing, fixture.vehicles[0]],
            '23503',
            'fk_vehicles_model',
          );
          await rejectsDatabase(
            source,
            'UPDATE vehicles SET generation_id = $1 WHERE id = $2',
            [fixture.otherGeneration, fixture.vehicles[0]],
            '23503',
            'fk_vehicles_generation_model',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO listing_locations(listing_id, point, city, country_code) VALUES ($1, ST_SetSRID(ST_MakePoint(4, 52), 4326), $2, $3)',
            [fixture.missing, 'Amsterdam', 'NL'],
            '23503',
            'fk_listing_locations_listing',
          );
          await rejectsDatabase(
            source,
            "INSERT INTO favorites(user_id, listing_id, listing_type) VALUES ($1, $2, 'VEHICLE')",
            [fixture.buyer, fixture.missing],
            '23503',
            'fk_favorites_listing',
          );
        },
      );

      await t.test(
        'Point 4326 enforces shape, SRID, nonempty finite latitude/longitude ranges',
        async () => {
          await rejectsDatabase(
            source,
            'UPDATE listing_locations SET point = ST_SetSRID(ST_MakePoint(4, 52), 3857) WHERE listing_id = $1',
            [fixture.listings[0]],
            '22023',
          );
          await rejectsDatabase(
            source,
            "UPDATE listing_locations SET point = ST_GeomFromText('LINESTRING(4 52,5 53)', 4326) WHERE listing_id = $1",
            [fixture.listings[0]],
            '22023',
          );
          await rejectsDatabase(
            source,
            'UPDATE listing_locations SET point = ST_SetSRID(ST_MakePoint(181, 52), 4326) WHERE listing_id = $1',
            [fixture.listings[0]],
            '23514',
            'ck_listing_locations_point',
          );
          await rejectsDatabase(
            source,
            'UPDATE listing_locations SET point = ST_SetSRID(ST_MakePoint(4, 91), 4326) WHERE listing_id = $1',
            [fixture.listings[0]],
            '23514',
            'ck_listing_locations_point',
          );
          await rejectsDatabase(
            source,
            "UPDATE listing_locations SET point = ST_GeomFromText('POINT EMPTY', 4326) WHERE listing_id = $1",
            [fixture.listings[0]],
            '23514',
            'ck_listing_locations_point',
          );
        },
      );

      await t.test(
        'real PostGIS radius, bbox and nearest queries return deterministic city ordering',
        async () => {
          const distances: { city: string; metres: number }[] =
            await source.query(
              'SELECT city, ST_Distance(point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS metres FROM listing_locations ORDER BY metres',
              [4.9041, 52.3676],
            );
          assert.deepEqual(
            distances.map((row) => row.city),
            ['Amsterdam', 'Utrecht', 'Rotterdam'],
          );
          assert.equal(distances[0]?.metres, 0);
          assert.ok(
            (distances[1]?.metres ?? 0) > 33000 &&
              (distances[1]?.metres ?? 0) < 35000,
          );
          assert.ok(
            (distances[2]?.metres ?? 0) > 55000 &&
              (distances[2]?.metres ?? 0) < 60000,
          );
          const radius: { city: string }[] = await source.query(
            'SELECT city FROM listing_locations WHERE ST_DWithin(point::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3) ORDER BY city',
            [4.9041, 52.3676, 40000],
          );
          assert.deepEqual(
            radius.map((row) => row.city),
            ['Amsterdam', 'Utrecht'],
          );
          const bbox: { city: string }[] = await source.query(
            'SELECT city FROM listing_locations WHERE point && ST_MakeEnvelope($1, $2, $3, $4, 4326) ORDER BY city',
            [4.8, 52.3, 5.0, 52.5],
          );
          assert.deepEqual(
            bbox.map((row) => row.city),
            ['Amsterdam'],
          );
          const nearest: { city: string }[] = await source.query(
            'SELECT city FROM listing_locations ORDER BY point::geography <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography LIMIT 2',
            [4.9041, 52.3676],
          );
          assert.deepEqual(
            nearest.map((row) => row.city),
            ['Amsterdam', 'Utrecht'],
          );
        },
      );

      await t.test(
        'message sender must participate; groups and cursor ordering remain possible',
        async () => {
          await rejectsDatabase(
            source,
            'INSERT INTO messages(conversation_id, sender_id, client_message_id, body) VALUES ($1, $2, gen_random_uuid(), $3)',
            [fixture.missing, fixture.buyer, 'Invalid conversation'],
            '23503',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO messages(conversation_id, sender_id, client_message_id, body) VALUES ($1, $2, gen_random_uuid(), $3)',
            [fixture.conversation, fixture.missing, 'Invalid sender'],
            '23503',
            'fk_messages_sender_participant',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO messages(conversation_id, sender_id, client_message_id, body) VALUES ($1, $2, gen_random_uuid(), $3)',
            [fixture.conversation, fixture.moderator, 'Nonparticipant'],
            '23503',
            'fk_messages_sender_participant',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO conversation_participants(conversation_id, user_id) VALUES ($1, $2)',
            [fixture.conversation, fixture.buyer],
            '23505',
          );
          await source.query(
            'INSERT INTO conversation_participants(conversation_id, user_id) VALUES ($1, $2)',
            [fixture.conversation, fixture.moderator],
          );
          const ids = [
            '80000000-0000-4000-8000-000000000002',
            '80000000-0000-4000-8000-000000000003',
          ];
          for (const id of ids)
            await source.query(
              'INSERT INTO messages(id, conversation_id, sender_id, client_message_id, body, created_at) VALUES ($1, $2, $3, $1, $4, $5)',
              [
                id,
                fixture.conversation,
                fixture.moderator,
                'Group message',
                '2026-09-01T00:00:00Z',
              ],
            );
          const page: { id: string }[] = await source.query(
            'SELECT id FROM messages WHERE conversation_id = $1 AND (created_at, id) > ($2::timestamptz, $3::uuid) ORDER BY created_at, id LIMIT 1',
            [fixture.conversation, '2026-09-01T00:00:00Z', ids[0]],
          );
          assert.equal(page[0]?.id, ids[1]);
        },
      );

      await t.test(
        'reports and moderation use exactly one existing target and compatible action',
        async () => {
          await rejectsDatabase(
            source,
            'INSERT INTO reports(reporter_id, target_type, reason_code, reason) VALUES ($1, $2, $3, $4)',
            [fixture.buyer, 'LISTING', 'OTHER', 'Missing target'],
            '23514',
            'ck_reports_target',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO reports(reporter_id, target_type, listing_id, message_id, reason_code, reason) VALUES ($1, $2, $3, $4, $5, $6)',
            [
              fixture.buyer,
              'LISTING',
              fixture.listings[0],
              fixture.message,
              'OTHER',
              'Ambiguous target',
            ],
            '23514',
            'ck_reports_target',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO reports(reporter_id, target_type, message_id, reason_code, reason) VALUES ($1, $2, $3, $4, $5)',
            [
              fixture.buyer,
              'MESSAGE',
              fixture.missing,
              'OTHER',
              'Missing message',
            ],
            '23503',
            'fk_reports_message',
          );
          await source.query(
            'INSERT INTO reports(reporter_id, target_type, target_user_id, reason_code, reason) VALUES ($1, $2, $3, $4, $5)',
            [fixture.buyer, 'USER', fixture.seller, 'OTHER', 'User review'],
          );
          await source.query(
            'INSERT INTO reports(reporter_id, target_type, message_id, reason_code, reason) VALUES ($1, $2, $3, $4, $5)',
            [
              fixture.seller,
              'MESSAGE',
              fixture.message,
              'OTHER',
              'Message review',
            ],
          );
          await rejectsDatabase(
            source,
            'INSERT INTO moderation_actions(moderator_id, target_type, listing_id, action, reason_code, internal_note) VALUES ($1, $2, $3, $4, $5, $6)',
            [
              fixture.moderator,
              'LISTING',
              fixture.listings[0],
              'BLOCK_USER',
              'OTHER',
              'Incompatible action',
            ],
            '23514',
            'ck_moderation_actions_action',
          );
        },
      );

      await t.test(
        'version CAS prevents concurrent lost updates and rejects a different seller',
        async () => {
          const persistence = new ListingPersistence(source);
          const input = {
            id: fixture.listings[0],
            sellerId: fixture.seller,
            expectedVersion: 1,
            currency: 'EUR',
          };
          assert.equal(
            await persistence.compareAndSetPrice({
              ...input,
              sellerId: fixture.buyer,
              priceMinor: '100',
            }),
            null,
          );
          const results = await Promise.all([
            persistence.compareAndSetPrice({
              ...input,
              priceMinor: '9007199254740994',
            }),
            persistence.compareAndSetPrice({
              ...input,
              priceMinor: '9007199254740995',
            }),
          ]);
          assert.deepEqual(
            results.filter((result) => result !== null),
            [2],
          );
          assert.equal(results.filter((result) => result === null).length, 1);
          const stored = await source
            .getRepository(Listing)
            .findOneByOrFail({ id: fixture.listings[0] });
          assert.equal(stored.version, 2);
          assert.ok(
            ['9007199254740994', '9007199254740995'].includes(
              stored.priceMinor,
            ),
          );
          assert.equal(
            await persistence.compareAndSetPrice({ ...input, priceMinor: '1' }),
            null,
          );
        },
      );

      await t.test(
        'token rotation history is retained with only one unconsumed token per family',
        async () => {
          await rejectsDatabase(
            source,
            'INSERT INTO session_tokens(session_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [fixture.session, 'b'.repeat(64), '2100-01-01T00:00:00Z'],
            '23505',
            'uq_session_tokens_live',
          );
          await source.query(
            'UPDATE session_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE session_id = $1',
            [fixture.session],
          );
          await source.query(
            'INSERT INTO session_tokens(session_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [fixture.session, 'b'.repeat(64), '2100-01-01T00:00:00Z'],
          );
          const tokens: { token_hash: string; consumed_at: Date | null }[] =
            await source.query(
              'SELECT token_hash, consumed_at FROM session_tokens WHERE session_id = $1 ORDER BY created_at',
              [fixture.session],
            );
          assert.equal(tokens.length, 2);
          assert.equal(tokens[0]?.token_hash, 'a'.repeat(64));
          assert.ok(tokens[0]?.consumed_at instanceof Date);
          await rejectsDatabase(
            source,
            'INSERT INTO session_tokens(session_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [fixture.session, 'raw-refresh-token', '2100-01-01T00:00:00Z'],
            '23514',
            'ck_session_tokens_hash',
          );
        },
      );

      await t.test(
        'ordinary entity reads omit credentials, token hashes, VIN, exact point and audit metadata',
        async () => {
          assert.equal(
            (
              await source
                .getRepository(User)
                .findOneByOrFail({ id: fixture.seller })
            ).emailNormalized,
            undefined,
          );
          assert.equal(
            (
              await source
                .getRepository(UserCredential)
                .findOneByOrFail({ userId: fixture.seller })
            ).passwordHash,
            undefined,
          );
          assert.equal(
            (
              await source
                .getRepository(SessionToken)
                .findOneByOrFail({ sessionId: fixture.session })
            ).tokenHash,
            undefined,
          );
          assert.equal(
            (
              await source
                .getRepository(Vehicle)
                .findOneByOrFail({ id: fixture.vehicles[0] })
            ).vin,
            undefined,
          );
          const location = await source
            .getRepository(ListingLocation)
            .findOneByOrFail({ listingId: fixture.listings[0] });
          assert.equal(location.point, undefined);
          assert.equal(location.publicPoint, null);
          const exact = await source
            .getRepository(ListingLocation)
            .createQueryBuilder('location')
            .addSelect('location.point')
            .where('location.listingId = :id', { id: fixture.listings[0] })
            .getOneOrFail();
          assert.deepEqual(exact.point, {
            type: 'Point',
            coordinates: [4.9041, 52.3676],
          });
          assert.equal(
            (
              await source
                .getRepository(AuditLog)
                .findOneByOrFail({ targetId: fixture.listings[0] })
            ).metadata,
            undefined,
          );
        },
      );

      await t.test(
        'deletion restricts business history; audit survives orphan actor deletion; disposable data cascades',
        async () => {
          await rejectsDatabase(
            source,
            'DELETE FROM users WHERE id = $1',
            [fixture.seller],
            '23503',
          );
          await rejectsDatabase(
            source,
            'DELETE FROM listings WHERE id = $1',
            [fixture.listings[0]],
            '23503',
          );
          await rejectsDatabase(
            source,
            'DELETE FROM vehicles WHERE id = $1',
            [fixture.vehicles[0]],
            '23503',
            'fk_vehicle_listings_vehicle',
          );
          await rejectsDatabase(
            source,
            'DELETE FROM messages WHERE id = $1',
            [fixture.message],
            '23503',
            'fk_reports_message',
          );
          const actor = randomUUID();
          await source.getRepository(User).insert({
            id: actor,
            emailNormalized: 'audit-actor@example.test',
            displayName: 'Disposable actor',
          });
          await source.query(
            "INSERT INTO favorites(user_id, listing_id, listing_type) VALUES ($1, $2, 'VEHICLE')",
            [actor, fixture.listings[1]],
          );
          const auditId = await new AuditWriter(source).append({
            actorUserId: actor,
            action: 'ACCOUNT_BLOCKED',
            targetType: 'USER',
            targetId: actor,
            requestId: 'schema-test',
            metadata: { nextStatus: 'BLOCKED' },
          });
          await source.query('DELETE FROM users WHERE id = $1', [actor]);
          const record = await source
            .getRepository(AuditLog)
            .findOneByOrFail({ id: auditId });
          assert.equal(record.actorUserId, null);
          assert.equal(record.targetId, actor);
          const remaining: { count: string }[] = await source.query(
            'SELECT count(*) FROM favorites WHERE user_id = $1',
            [actor],
          );
          assert.equal(remaining[0]?.count, '0');
        },
      );

      await t.test(
        'audit append participates in caller transactions; JSON payloads require bounded objects',
        async () => {
          const writer = new AuditWriter(source);
          const entry = {
            actorUserId: null,
            action: 'SYSTEM_REVIEW',
            targetType: 'LISTING',
            targetId: fixture.listings[0],
            requestId: 'rolled-back-transaction',
            metadata: { reasonCode: 'AUTOMATED_REVIEW' },
          };
          await assert.rejects(
            () =>
              source.transaction(async (manager) => {
                await writer.append(entry, manager);
                throw new Error('Rollback business operation');
              }),
            /Rollback business/,
          );
          const counts: { count: string }[] = await source.query(
            'SELECT count(*) FROM audit_logs WHERE request_id = $1',
            [entry.requestId],
          );
          assert.equal(counts[0]?.count, '0');
          await rejectsDatabase(
            source,
            "INSERT INTO saved_searches(user_id, name, filters, listing_type, filter_fingerprint) VALUES ($1, $2, $3, 'VEHICLE', $4)",
            [fixture.buyer, 'Invalid', JSON.stringify([]), 'b'.repeat(64)],
            '23514',
            'ck_saved_searches_filters',
          );
          await rejectsDatabase(
            source,
            'INSERT INTO notifications(user_id, type, payload) VALUES ($1, $2, $3)',
            [
              fixture.buyer,
              'NEW_MESSAGE',
              { schemaVersion: 1, data: 'x'.repeat(17000) },
            ],
            '23514',
            'ck_notifications_payload',
          );
        },
      );
    } finally {
      await database.close();
    }
  },
);
