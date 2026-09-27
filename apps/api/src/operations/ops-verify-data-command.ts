import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/config';
import { databaseOptions } from '../platform/database/database-options';
import { verifyDataIntegrity } from './operational-data';

async function main(): Promise<void> {
  const config = loadConfig();
  const source = new DataSource(databaseOptions(config));
  await source.initialize();
  try {
    const findings = await verifyDataIntegrity(source, config);
    process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
    if (findings.some((finding) => finding.critical && finding.count > 0))
      process.exitCode = 2;
  } finally {
    await source.destroy();
  }
}

void main().catch(() => {
  process.stderr.write('Data integrity verification failed\n');
  process.exitCode = 1;
});
