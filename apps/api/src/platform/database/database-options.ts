import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../../config/config';
import { marketplaceEntities } from './entity-registry';

export function databaseOptions(config: AppConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    username: config.database.user,
    password: config.database.password,
    ssl: config.database.ssl ? { rejectUnauthorized: true } : false,
    synchronize: false,
    migrationsRun: false,
    logging: false,
    // PostgreSQL >=13 provides gen_random_uuid() without extension installation.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    entities: marketplaceEntities,
    migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
    extra: {
      max: config.database.poolMax,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      idleTimeoutMillis: config.database.idleTimeoutMs,
      query_timeout: config.database.statementTimeoutMs,
      statement_timeout: config.database.statementTimeoutMs,
      lock_timeout: config.database.lockTimeoutMs,
      idle_in_transaction_session_timeout:
        config.database.idleTransactionTimeoutMs,
      application_name: 'automotive-marketplace-api',
      options: [
        '-c timezone=UTC',
        `-c lock_timeout=${config.database.lockTimeoutMs}`,
        `-c idle_in_transaction_session_timeout=${config.database.idleTransactionTimeoutMs}`,
      ].join(' '),
    },
  };
}
