import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { loadConfig } from '../../src/config/config';
import { databaseOptions } from '../../src/platform/database/database-options';

/** Never drop/recreate either configured dev/test DB. Own a new database per suite. */
export async function createSchemaDatabase(): Promise<{
  source: DataSource;
  close: () => Promise<void>;
}> {
  const config = loadConfig('test');
  if (config.environment !== 'test' || !config.database.name.endsWith('_test'))
    throw new Error('Isolated test configuration required');
  const name = `marketplace_schema_${randomUUID().replaceAll('-', '')}_test`;
  if (!/^marketplace_schema_[a-f0-9]{32}_test$/.test(name))
    throw new Error('Invalid owned database name');
  const admin = new DataSource({
    ...databaseOptions(config),
    entities: [],
    migrations: [],
    extra: {
      max: 2,
      connectionTimeoutMillis: 3000,
      query_timeout: 60000,
      statement_timeout: 60000,
      options: '-c timezone=UTC',
    },
  });
  const source = new DataSource(
    databaseOptions({ ...config, database: { ...config.database, name } }),
  );
  await admin.initialize();
  let created = false;
  const close = async (): Promise<void> => {
    try {
      if (source.isInitialized) await source.destroy();
      if (created) {
        await admin.query(`SET statement_timeout = '60s'`);
        await admin.query(`DROP DATABASE "${name}"`);
      }
    } finally {
      await admin.destroy();
    }
  };
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    await source.initialize();
    return { source, close };
  } catch (error) {
    await close();
    throw error;
  }
}
