import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = resolve('.test-build/test/integration');
const files = readdirSync(directory)
  .filter((name) => name.endsWith('.test.js'))
  .sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  throw new Error(`No compiled integration tests found in ${directory}`);
}

for (const name of files) {
  const file = resolve(directory, name);
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-isolation=none', '--test-concurrency=1', file],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
