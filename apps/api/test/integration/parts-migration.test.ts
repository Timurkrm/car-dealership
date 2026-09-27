import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createSchemaDatabase } from '../support/schema-database';
import { seedVehicleCatalog } from '../../src/modules/vehicles/infrastructure/persistence/catalog.seed';
import { seedReadyPhoto } from '../support/ready-media-fixture';
import { PartCategory } from '../../src/modules/parts/infrastructure/persistence/part-category.entity';
import {
  seedPartCatalog,
  PART_CATEGORY_IDS,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';
test(
  'subtype migration preserves populated vehicle listings and every common listing association on apply, rollback and reapply',
  { timeout: 90000 },
  async () => {
    const db = await createSchemaDatabase();
    const { source } = db;
    const migrations = [...source.migrations];
    try {
      source.migrations.splice(
        0,
        source.migrations.length,
        ...migrations.filter(
          (row) =>
            row.name !== 'MarketplaceListingSubtypes1790000000000' &&
            row.name !== 'EngagementOutbox1790200000000' &&
            row.name !== 'MessagingRealtime1790300000000' &&
            row.name !== 'AccountEmailDelivery1790400000000' &&
            row.name !== 'MessagingModerationReadOnly1790500000000',
        ),
      );
      await source.runMigrations();
      await source.transaction(seedVehicleCatalog);
      const seller = randomUUID(),
        buyer = randomUUID(),
        vehicle = randomUUID(),
        listing = randomUUID();
      for (const id of [seller, buyer])
        await source.query(
          'INSERT INTO users(id,email_normalized,display_name) VALUES ($1,$2,$3)',
          [id, id + '@example.test', 'Migration user'],
        );
      await source.query(
        "INSERT INTO vehicles(id,model_id,year,mileage_km,body_type,fuel_type,transmission,drive_type,condition) VALUES ($1,'20000000-0000-4000-8000-000000000001',2022,10000,'SEDAN','PETROL','AUTOMATIC','RWD','USED')",
        [vehicle],
      );
      await source.query(
        "INSERT INTO listings(id,seller_id,vehicle_id,title,description,price_minor,currency,status,version,published_at,created_at,updated_at) VALUES ($1,$2,$3,'Preserved car','Vehicle description',9007199254740993,'EUR','PUBLISHED',11,'2026-02-02T00:00:00Z','2026-01-01T00:00:00Z','2026-02-03T00:00:00Z')",
        [listing, seller, vehicle],
      );
      await source.query(
        "INSERT INTO listing_locations(listing_id,city,country_code,point,public_point) VALUES ($1,'Amsterdam','NL',ST_SetSRID(ST_MakePoint(4.904,52.367),4326),ST_SetSRID(ST_MakePoint(4.9,52.36),4326))",
        [listing],
      );
      await seedReadyPhoto(source, listing);
      await source.query(
        'INSERT INTO favorites(user_id,listing_id) VALUES ($1,$2)',
        [buyer, listing],
      );
      await source.query('INSERT INTO conversations(listing_id) VALUES ($1)', [
        listing,
      ]);
      await source.query(
        "INSERT INTO reports(reporter_id,target_type,listing_id,reason_code,reason) VALUES ($1,'LISTING',$2,'OTHER','Preserved report')",
        [buyer, listing],
      );
      await source.query(
        "INSERT INTO moderation_actions(moderator_id,target_type,listing_id,action,reason_code,internal_note) VALUES ($1,'LISTING',$2,'APPROVE_LISTING','APPROVED','Preserved approval')",
        [seller, listing],
      );
      await source.query(
        "INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES ($1,'LISTING_CREATED','LISTING',$2,'{}')",
        [seller, listing],
      );
      const root = () =>
        source.query(
          'SELECT id,seller_id,title,description,price_minor,currency,status,version,published_at,created_at,updated_at FROM listings WHERE id=$1',
          [listing],
        );
      const tables = [
        'listing_locations',
        'listing_media',
        'listing_media_variants',
        'favorites',
        'conversations',
        'reports',
        'moderation_actions',
        'audit_logs',
      ] as const;
      const snapshot = async () =>
        Object.fromEntries(
          await Promise.all(
            tables.map(async (table) => [
              table,
              await source.query(
                'SELECT * FROM ' +
                  table +
                  ' ORDER BY ' +
                  (table === 'listing_media_variants'
                    ? 'media_id,kind'
                    : table === 'listing_locations'
                      ? 'listing_id'
                      : table === 'favorites'
                        ? 'user_id,listing_id'
                        : 'id'),
              ),
            ]),
          ),
        );
      const beforeRoot: unknown = await root();
      const before: unknown = await snapshot();
      source.migrations.splice(
        0,
        source.migrations.length,
        ...migrations.filter(
          (row) =>
            row.name !== 'EngagementOutbox1790200000000' &&
            row.name !== 'MessagingRealtime1790300000000' &&
            row.name !== 'AccountEmailDelivery1790400000000' &&
            row.name !== 'MessagingModerationReadOnly1790500000000',
        ),
      );
      assert.equal((await source.runMigrations()).length, 1);
      assert.deepEqual(await root(), beforeRoot);
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(
        await source.query(
          'SELECT listing_id,vehicle_id,type FROM vehicle_listings',
        ),
        [{ listing_id: listing, vehicle_id: vehicle, type: 'VEHICLE' }],
      );
      assert.equal(
        (
          await source.query('SELECT type FROM listings WHERE id=$1', [listing])
        )[0].type,
        'VEHICLE',
      );
      await source.undoLastMigration();
      assert.equal(
        (
          await source.query('SELECT vehicle_id FROM listings WHERE id=$1', [
            listing,
          ])
        )[0].vehicle_id,
        vehicle,
      );
      assert.deepEqual(await root(), beforeRoot);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await source.runMigrations()).length, 1);
      assert.deepEqual(await root(), beforeRoot);
      assert.deepEqual(await snapshot(), before);
      source.migrations.splice(0, source.migrations.length, ...migrations);
      assert.equal((await source.runMigrations()).length, 4);
      assert.equal(await source.showMigrations(), false);
      const diff = await source.driver.createSchemaBuilder().log();
      assert.equal(
        diff.upQueries.length,
        0,
        diff.upQueries.map((query) => query.query).join('\n'),
      );
    } finally {
      await db.close();
    }
  },
);
test('part development catalog seed resolves preexisting parent IDs by slug and preserves custom names/active state', async () => {
  const db = await createSchemaDatabase();
  const { source } = db;
  try {
    await source.runMigrations();
    const parentId = randomUUID();
    await source.manager.insert(PartCategory, {
      id: parentId,
      parentId: null,
      name: 'Custom brakes',
      slug: 'brakes',
      isActive: false,
    });
    await source.transaction(seedPartCatalog);
    await source.transaction(seedPartCatalog);
    const parent = await source.manager.findOneByOrFail(PartCategory, {
      id: parentId,
    });
    assert.equal(parent.name, 'Custom brakes');
    assert.equal(parent.isActive, false);
    const child = await source.manager.findOneByOrFail(PartCategory, {
      id: PART_CATEGORY_IDS.pads,
    });
    assert.equal(child.parentId, parentId);
    assert.equal(await source.manager.count(PartCategory), 13);
  } finally {
    await db.close();
  }
});
