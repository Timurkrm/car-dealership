import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../../src/config/config';
import { databaseOptions } from '../../src/platform/database/database-options';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';
import { seedReadyPhoto } from '../support/ready-media-fixture';

async function main(): Promise<void> {
  const config = loadConfig('test');
  if (!config.database.name.includes('_restore_source_'))
    throw new Error('Restore fixture requires an isolated restore source DB');
  const source = new DataSource(databaseOptions(config));
  await source.initialize();
  try {
    await seedMarketplaceFixture(source);
    await source.query(
      `UPDATE listings SET status='DRAFT', published_at=NULL
       WHERE id = ANY($1::uuid[])`,
      [fixture.listings.slice(1)],
    );
    const categoryId = '91000000-0000-4000-8000-000000000001';
    const partId = '92000000-0000-4000-8000-000000000001';
    const listingId = '93000000-0000-4000-8000-000000000001';
    await source.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO part_categories(id,parent_id,name,slug,is_active,sort_order)
         VALUES ($1,NULL,'Restore category','restore-category',true,0)`,
        [categoryId],
      );
      await manager.query(
        `INSERT INTO parts(id,category_id,brand_id,name,condition,fitment_mode)
         VALUES ($1,$2,NULL,'Restore part','NEW','UNIVERSAL')`,
        [partId, categoryId],
      );
      await manager.query(
        `INSERT INTO listings(id,seller_id,type,title,price_minor,currency,status,published_at)
         VALUES ($1,$2,'PART','Restore part listing',10000,'EUR','PUBLISHED',CURRENT_TIMESTAMP)`,
        [listingId, fixture.seller],
      );
      await manager.query(
        `INSERT INTO part_listings(listing_id,type,part_id,quantity_available)
         VALUES ($1,'PART',$2,2)`,
        [listingId, partId],
      );
    });
    await seedReadyPhoto(source, listingId);
    const notification: Array<{ id: string }> = await source.query(
      `SELECT id FROM notifications ORDER BY created_at, id LIMIT 1`,
    );
    await source.query(
      `INSERT INTO notification_deliveries(
        notification_id,user_id,channel,template,status,mandatory,dedupe_key,
        payload,attempts,available_at
       ) VALUES ($1,$2,'EMAIL','NEW_MESSAGE','PENDING',false,$3,$4,0,CURRENT_TIMESTAMP)`,
      [
        notification[0]?.id,
        fixture.seller,
        'restore-fixture-notification-email',
        { schemaVersion: 1, conversationId: fixture.conversation },
      ],
    );
  } finally {
    await source.destroy();
  }
}

void main().catch(() => {
  process.stderr.write('Restore fixture failed\n');
  process.exitCode = 1;
});
