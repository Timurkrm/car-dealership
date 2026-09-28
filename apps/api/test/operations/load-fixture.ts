import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../../src/config/config';
import { databaseOptions } from '../../src/platform/database/database-options';
import { fixture } from '../support/marketplace-fixture';

async function main(): Promise<void> {
  const config = loadConfig('test');
  if (config.database.name !== 'marketplace_e2e_test')
    throw new Error('Load fixture refuses to use a non-E2E database');
  const source = new DataSource(databaseOptions(config));
  await source.initialize();
  const size = Math.min(
    50_000,
    Math.max(1_000, Number(process.env.LOAD_DATASET_SIZE ?? 20_000)),
  );
  try {
    await source.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO vehicles(id,model_id,generation_id,year,mileage_km,body_type,fuel_type,transmission,drive_type,color,condition)
         SELECT md5('load-vehicle-'||g)::uuid,$2,$3,2000+(g%25),(g*791)%300000,
                (ARRAY['SEDAN','HATCHBACK','SUV','WAGON'])[(g%4)+1],
                (ARRAY['PETROL','DIESEL','ELECTRIC','HYBRID'])[(g%4)+1],
                (ARRAY['MANUAL','AUTOMATIC'])[(g%2)+1],
                (ARRAY['FWD','RWD','AWD'])[(g%3)+1],
                (ARRAY['BLACK','WHITE','BLUE','RED'])[(g%4)+1],'USED'
         FROM generate_series(1,$1::integer) g`,
        [size, fixture.model, fixture.generation],
      );
      await manager.query(
        `INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status,published_at,created_at)
         SELECT md5('load-listing-'||g)::uuid,$2,'VEHICLE','Load vehicle '||g,
                'Deterministic capacity fixture',100000+(g%50000)*100,'EUR','PUBLISHED',
                CURRENT_TIMESTAMP-(g||' seconds')::interval,CURRENT_TIMESTAMP-(g||' seconds')::interval
         FROM generate_series(1,$1::integer) g`,
        [size, fixture.seller],
      );
      await manager.query(
        `INSERT INTO vehicle_listings(listing_id,type,vehicle_id)
         SELECT md5('load-listing-'||g)::uuid,'VEHICLE',md5('load-vehicle-'||g)::uuid
         FROM generate_series(1,$1::integer) g`,
        [size],
      );
      await manager.query(
        `INSERT INTO listing_locations(listing_id,point,public_point,city,region,country_code)
         SELECT md5('load-listing-'||g)::uuid,p,p,'Load City','Load Region','NL'
         FROM (SELECT g,ST_SetSRID(ST_MakePoint(3.0+(g%4000)/1000.0,50.5+(g%2500)/1000.0),4326) p
               FROM generate_series(1,$1::integer) g) generated`,
        [size],
      );
      await manager.query(
        `INSERT INTO listing_media(id,listing_id,storage_key,sort_order,is_primary,status,width,height,source_size,processed_at)
         SELECT md5('load-media-'||g)::uuid,md5('load-listing-'||g)::uuid,
                'load/'||g||'/source.webp',0,true,'READY',60,40,100,CURRENT_TIMESTAMP
         FROM generate_series(1,$1::integer) g`,
        [size],
      );
      await manager.query(
        `INSERT INTO listing_media_variants(media_id,kind,storage_key,width,height,size)
         SELECT md5('load-media-'||g)::uuid,kind,'load/'||g||'/'||kind||'.webp',60,40,100
         FROM generate_series(1,$1::integer) g
         CROSS JOIN unnest(ARRAY['thumbnail','medium','large']) kind`,
        [size],
      );
    });
    await source.query('ANALYZE listings');
    await source.query('ANALYZE vehicles');
    await source.query('ANALYZE listing_locations');
    await source.query('ANALYZE listing_media');
  } finally {
    await source.destroy();
  }
  process.stdout.write(`Seeded ${size} load listings\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Load fixture failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
