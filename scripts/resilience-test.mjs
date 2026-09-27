import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const { fetch, AbortSignal } = globalThis;

if (existsSync('.env.test')) loadEnvFile('.env.test');
if (
  process.env.NODE_ENV !== 'test' ||
  !process.env.DATABASE_NAME?.endsWith('_test')
)
  throw new Error('Resilience test requires the isolated test environment');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run resilience test through npm');
const compose = [
  'compose',
  '-p',
  'marketplace-test',
  '--env-file',
  '.env.test',
];
const apiOrigin = `http://127.0.0.1:${process.env.API_PORT}`;
let api;
try {
  npmRun(['run', 'test:resilience', '--workspace', '@marketplace/api']);
  npmRun(['run', 'build', '--workspace', '@marketplace/api']);
  npmRun(['run', 'migration:run'], { NODE_ENV: 'test' });
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: process.env,
    stdio: 'inherit',
  });
  await waitFor(`${apiOrigin}/api/v1/health/ready`, 200);

  docker('stop', 'redis');
  await waitFor(`${apiOrigin}/api/v1/health/ready`, 200);
  await waitFor(`${apiOrigin}/api/v1/listings?limit=1`, 503);
  docker('start', 'redis');
  await waitFor(`${apiOrigin}/api/v1/listings?limit=1`, 200, 30_000);

  docker('stop', 'postgres');
  await waitFor(`${apiOrigin}/api/v1/health/ready`, 503, 20_000);
  docker('start', 'postgres');
  await waitFor(`${apiOrigin}/api/v1/health/ready`, 200, 30_000);

  run(process.execPath, [
    'apps/api/dist/operations/ops-storage-probe-command.js',
  ]);
  docker('stop', 'minio');
  await waitFor(`${apiOrigin}/api/v1/health/ready`, 200);
  const unavailable = spawnSync(
    process.execPath,
    ['apps/api/dist/operations/ops-storage-probe-command.js'],
    { env: process.env, stdio: 'ignore' },
  );
  if (unavailable.status === 0)
    throw new Error('Object storage probe unexpectedly succeeded');
  docker('start', 'minio');
  await retryCommand(
    process.execPath,
    ['apps/api/dist/operations/ops-storage-probe-command.js'],
    30_000,
  );
  npmRun(['run', 'ops:verify-data'], { NODE_ENV: 'test' });
  process.stdout.write('Resilience dependency restart scenarios passed\n');
} finally {
  for (const service of ['postgres', 'redis', 'minio']) {
    try {
      docker('start', service);
    } catch {
      process.stderr.write(`Failed to restore ${service}\n`);
    }
  }
  if (api && api.exitCode === null) {
    api.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => api.once('exit', resolve)),
      delay(5000),
    ]);
    if (api.exitCode === null) api.kill('SIGKILL');
  }
}

function docker(...args) {
  run('docker', [...compose, ...args]);
}

function npmRun(args, extraEnv = {}) {
  run(process.execPath, [npmCli, ...args], extraEnv);
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with exit ${result.status}`);
}

async function waitFor(url, status, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      await response.body?.cancel();
      if (response.status === status) return;
    } catch {
      // The dependency or process is still transitioning.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${status} from ${url}`);
}

async function retryCommand(command, args, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync(command, args, {
      env: process.env,
      stdio: 'ignore',
    });
    if (result.status === 0) return;
    await delay(500);
  }
  throw new Error(`${command} did not recover`);
}
