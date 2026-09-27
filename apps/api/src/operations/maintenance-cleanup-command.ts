import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/config';
import { databaseOptions } from '../platform/database/database-options';
import { StructuredLogger } from '../platform/logging/structured-logger';
import { runMaintenanceCleanup } from './operational-data';

async function main(): Promise<void> {
  const config = loadConfig();
  const dryRun = process.argv.includes('--dry-run');
  if (
    config.environment === 'production' &&
    !dryRun &&
    !process.argv.includes('--confirm')
  )
    throw new Error('Production cleanup requires --confirm');
  const source = new DataSource(databaseOptions(config));
  await source.initialize();
  try {
    const result = await runMaintenanceCleanup(
      source,
      config,
      new StructuredLogger(config),
      dryRun,
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.acquired) process.exitCode = 3;
    else if (result.failedCategories.length) process.exitCode = 2;
  } finally {
    await source.destroy();
  }
}

void main().catch(() => {
  process.stderr.write('Maintenance cleanup failed\n');
  process.exitCode = 1;
});
