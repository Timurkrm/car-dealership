import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../../config/config';
import { seedVehicleCatalog } from '../../modules/vehicles/infrastructure/persistence/catalog.seed';
import { seedPartCatalog } from '../../modules/parts/infrastructure/persistence/catalog.seed';
import { databaseOptions } from './database-options';

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.environment === 'production') {
    throw new Error('Development catalog seed is prohibited in production');
  }
  const source = new DataSource(databaseOptions(config));
  try {
    await source.initialize();
    if (await source.showMigrations())
      throw new Error('Apply migrations before seeding');
    await source.transaction(async (manager) => {
      await seedVehicleCatalog(manager);
      await seedPartCatalog(manager);
    });
    console.info(
      'Development vehicle and part catalogs seeded (no user accounts or credentials).',
    );
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

void main().catch(() => {
  // Do not emit driver errors containing SQL, credentials or connection details.
  console.error(
    'Catalog seed failed; check environment and applied migrations.',
  );
  process.exitCode = 1;
});
