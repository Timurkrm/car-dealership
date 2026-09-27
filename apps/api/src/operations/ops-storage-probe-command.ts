import 'reflect-metadata';
import { loadConfig } from '../config/config';
import { ObjectStorage } from '../platform/storage/object-storage';

async function main(): Promise<void> {
  const storage = new ObjectStorage(loadConfig());
  try {
    await storage.checkBucket();
    process.stdout.write('Object storage available\n');
  } finally {
    storage.onApplicationShutdown();
  }
}

void main().catch(() => {
  process.stderr.write('Object storage unavailable\n');
  process.exitCode = 1;
});
