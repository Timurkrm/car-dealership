import { spawnSync } from 'node:child_process';

const prefix =
  process.argv[2] === 'test'
    ? ['compose', '-p', 'marketplace-test', '--env-file', '.env.test']
    : ['compose'];
// Compose --wait treats a completed one-shot init container as an exited service.
// Wait for long-lived services first, then explicitly check the bucket init exit code.
for (const args of [
  ['up', '-d', '--wait', 'postgres', 'redis', 'minio'],
  ['run', '--rm', '--no-deps', 'minio-init'],
]) {
  const result = spawnSync('docker', [...prefix, ...args], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
