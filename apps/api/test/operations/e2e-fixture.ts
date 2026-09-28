import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hash } from 'argon2';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { loadConfig, workspaceRoot } from '../../src/config/config';
import { databaseOptions } from '../../src/platform/database/database-options';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { PASSWORD_HASH_OPTIONS } from '../../src/modules/auth/infrastructure/crypto/password-hasher';
import {
  seedPartCatalog,
  PART_BRAND_IDS,
  PART_CATEGORY_IDS,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';
import { seedReadyPhoto } from '../support/ready-media-fixture';

const PASSWORD = 'Marketplace-e2e-password-2026!';
const ids = {
  ...fixture,
  admin: '40000000-0000-4000-8000-000000000004',
  blocked: '40000000-0000-4000-8000-000000000005',
  secondSeller: '40000000-0000-4000-8000-000000000006',
  part: '92000000-0000-4000-8000-000000000001',
  partListing: '93000000-0000-4000-8000-000000000001',
} as const;

async function main(): Promise<void> {
  const config = loadConfig('test');
  if (config.database.name !== 'marketplace_e2e_test')
    throw new Error('E2E fixture refuses to use a non-E2E database');
  const source = new DataSource(databaseOptions(config));
  await source.initialize();
  const storage = new ObjectStorage(config);
  try {
    await seedMarketplaceFixture(source);
    await seedPartCatalog(source.manager);
    const passwordHash = await hash(PASSWORD, PASSWORD_HASH_OPTIONS);
    await source.transaction(async (manager) => {
      await manager.query(
        `UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=ANY($1::uuid[])`,
        [[ids.seller, ids.buyer, ids.moderator]],
      );
      for (const [id, email, displayName, status] of [
        [ids.admin, 'admin@example.test', 'Admin', 'ACTIVE'],
        [ids.blocked, 'blocked@example.test', 'Blocked', 'BLOCKED'],
        [ids.secondSeller, 'seller2@example.test', 'Second Seller', 'ACTIVE'],
      ] as const)
        await manager.query(
          `INSERT INTO users(id,email_normalized,display_name,status,email_verified_at)
           VALUES ($1,$2,$3,$4::varchar,CASE WHEN $4::varchar='ACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
          [id, email, displayName, status],
        );
      await manager.query(
        `INSERT INTO user_roles(user_id,role) VALUES
         ($1,'USER'),($1,'ADMIN'),($2,'USER'),($3,'USER')`,
        [ids.admin, ids.blocked, ids.secondSeller],
      );
      await manager.query(
        `INSERT INTO user_credentials(user_id,password_hash)
         SELECT id,$1 FROM users
         ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
        [passwordHash],
      );
      await manager.query(
        `UPDATE listing_locations SET public_point=ST_SnapToGrid(point,0.01),region='North Holland'`,
      );
      await manager.query(
        `UPDATE listings SET description='Deterministic browser fixture' WHERE type='VEHICLE'`,
      );
      await manager.query(
        `INSERT INTO parts(id,category_id,brand_id,name,condition,manufacturer_part_number,oem_number,fitment_mode)
         VALUES ($1,$2,$3,'Bosch brake pads','NEW','BOSCH-E2E-001','OEM-E2E-001','VEHICLE_SPECIFIC')`,
        [ids.part, PART_CATEGORY_IDS.pads, PART_BRAND_IDS.bosch],
      );
      await manager.query(
        `INSERT INTO part_fitments(part_id,model_id,generation_id,year_from,year_to)
         VALUES ($1,$2,$3,2019,2024)`,
        [ids.part, ids.model, ids.generation],
      );
      await manager.query(
        `INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status,published_at)
         VALUES ($1,$2,'PART','Bosch brake pads E2E','Deterministic browser fixture',12999,'EUR','PUBLISHED',CURRENT_TIMESTAMP)`,
        [ids.partListing, ids.secondSeller],
      );
      await manager.query(
        `INSERT INTO part_listings(listing_id,type,part_id,quantity_available) VALUES ($1,'PART',$2,8)`,
        [ids.partListing, ids.part],
      );
      await manager.query(
        `INSERT INTO listing_locations(listing_id,point,public_point,city,region,country_code)
         VALUES ($1,ST_SetSRID(ST_MakePoint(4.91,52.37),4326),ST_SetSRID(ST_MakePoint(4.91,52.37),4326),'Amsterdam','North Holland','NL')`,
        [ids.partListing],
      );
    });
    await source.query(
      `DELETE FROM listing_media WHERE listing_id=ANY($1::uuid[])`,
      [[...ids.listings, ids.partListing]],
    );
    for (const listingId of [...ids.listings, ids.partListing])
      await seedReadyPhoto(source, listingId);
    const image = await sharp({
      create: { width: 60, height: 40, channels: 3, background: '#315b73' },
    })
      .webp()
      .toBuffer();
    const keys: Array<{ storage_key: string }> = await source.query(
      `SELECT storage_key FROM listing_media_variants ORDER BY storage_key`,
    );
    for (const row of keys) await storage.putVariant(row.storage_key, image);
    await writeFile(
      resolve(workspaceRoot(), '.tools/e2e-fixture.json'),
      JSON.stringify(
        {
          password: PASSWORD,
          users: {
            seller: 'seller@example.test',
            buyer: 'buyer@example.test',
            moderator: 'moderator@example.test',
            admin: 'admin@example.test',
            blocked: 'blocked@example.test',
            secondSeller: 'seller2@example.test',
          },
          ids,
        },
        null,
        2,
      ),
      'utf8',
    );
  } finally {
    storage.onApplicationShutdown();
    await source.destroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `E2E fixture failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
