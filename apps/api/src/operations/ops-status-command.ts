import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/config';
import { databaseOptions } from '../platform/database/database-options';
import { operationalStatus } from './operational-data';

async function main(): Promise<void> {
  const config = loadConfig();
  const source = new DataSource(databaseOptions(config));
  await source.initialize();
  try {
    const status = await operationalStatus(source);
    if (process.argv.includes('--json'))
      process.stdout.write(`${JSON.stringify(status)}\n`);
    else {
      process.stdout.write(
        `database writable=${status.database.writable} connections=${status.database.connections}\n` +
          `outbox pending=${status.outbox.pending} retry=${status.outbox.retry} failed=${status.outbox.failed} oldest=${status.outbox.oldestPendingSeconds ?? 0}s\n` +
          `delivery pending=${status.delivery.pending} retry=${status.delivery.retry} failed=${status.delivery.failed} oldest=${status.delivery.oldestPendingSeconds ?? 0}s\n` +
          `media ${JSON.stringify(status.media)}\n` +
          `duplicate-index-candidates=${status.duplicateIndexCandidates.length}\n`,
      );
    }
  } finally {
    await source.destroy();
  }
}

void main().catch(() => {
  process.stderr.write('Operational status failed\n');
  process.exitCode = 1;
});
