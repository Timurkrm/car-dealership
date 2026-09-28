import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, delimiter, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const npmCli =
  process.env.npm_execpath ??
  resolve(root, '.tools/node-v24.21.0-win-x64/node_modules/npm/bin/npm-cli.js');
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const envFile = resolve(root, '.env.e2e.example');
const fileEnv = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
const env = {
  ...process.env,
  ...fileEnv,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
  NEXT_PUBLIC_MAP_STYLE_URL: 'http://127.0.0.1:3300/style.json',
  NEXT_PUBLIC_MAP_ATTRIBUTION: 'QA local map',
};
if (
  process.argv.some(
    (value) =>
      value.startsWith('--load=') ||
      value === '--worker-traffic' ||
      value === '--fault-load',
  )
)
  env.TRUST_PROXY_HOPS = '1';
const compose = ['compose', '-p', 'marketplace-e2e', '--env-file', envFile];
const children = [];
let styleServer;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
  }
}
function start(command, args, name, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  child.stdout.on('data', (chunk) =>
    process.stdout.write(`[${name}] ${chunk}`),
  );
  child.stderr.on('data', (chunk) =>
    process.stderr.write(`[${name}] ${chunk}`),
  );
  children.push(child);
  return child;
}
const runNpm = (args, options) =>
  run(process.execPath, [npmCli, ...args], options);
const startNpm = (args, name) =>
  start(process.execPath, [npmCli, ...args], name);
async function waitFor(url, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready`);
}
async function stop() {
  if (process.platform === 'win32') {
    for (const child of children)
      if (child.exitCode === null)
        spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
        });
  } else {
    for (const child of children)
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* process already exited */
        }
      }
  }
  await new Promise((done) => styleServer?.close(done) ?? done());
  if (process.env.E2E_KEEP_INFRA !== '1')
    spawnSync(docker, [...compose, 'down', '-v', '--remove-orphans'], {
      cwd: root,
      stdio: 'inherit',
    });
}

async function main() {
  const forwarded = process.argv.slice(2);
  mkdirSync(resolve(root, 'qa-results'), { recursive: true });
  run(docker, [...compose, 'down', '-v', '--remove-orphans']);
  run(docker, [...compose, 'up', '-d', '--wait', 'postgres', 'redis', 'minio']);
  run(docker, [...compose, 'run', '--rm', '--no-deps', 'minio-init']);
  runNpm(['run', 'migration:run', '--workspace', '@marketplace/api'], {
    stdio: 'pipe',
  });
  runNpm([
    'exec',
    '--workspace',
    '@marketplace/api',
    '--',
    'tsc',
    '-p',
    'tsconfig.test.json',
  ]);
  run(process.execPath, [
    'apps/api/.test-build/test/operations/e2e-fixture.js',
  ]);
  const loadArgument = forwarded.find((value) => value.startsWith('--load='));
  const workerTraffic = forwarded.includes('--worker-traffic');
  const faultLoad = forwarded.includes('--fault-load');
  if (loadArgument) {
    env.AUTH_ACCESS_TOKEN_TTL = '900';
    run(process.execPath, [
      'apps/api/.test-build/test/operations/load-fixture.js',
    ]);
  }
  if (forwarded.includes('--prepare-only')) return;
  runNpm(['run', 'build', '--workspace', '@marketplace/api']);
  runNpm(['run', 'build', '--workspace', '@marketplace/web']);
  styleServer = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', fileEnv.WEB_URL);
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#d9e5eb' },
          },
        ],
      }),
    );
  });
  await new Promise((resolve, reject) =>
    styleServer.listen(3300, '127.0.0.1', resolve).once('error', reject),
  );
  const api = start(process.execPath, ['apps/api/dist/main.js'], 'api');
  startNpm(['run', 'start', '--workspace', '@marketplace/web'], 'web');
  const media = start(
    process.execPath,
    ['apps/api/dist/main-media-worker.js'],
    'media',
  );
  const engagement = start(
    process.execPath,
    ['apps/api/dist/main-engagement-worker.js'],
    'engagement',
  );
  const delivery = start(
    process.execPath,
    ['apps/api/dist/main-delivery-worker.js'],
    'delivery',
  );
  env.API_PID = String(api.pid);
  env.MEDIA_WORKER_PID = String(media.pid);
  env.ENGAGEMENT_WORKER_PID = String(engagement.pid);
  env.DELIVERY_WORKER_PID = String(delivery.pid);
  await waitFor(`${fileEnv.API_URL}/api/v1/health/ready`, 'API');
  await waitFor(fileEnv.WEB_URL, 'Web');
  if (loadArgument)
    for (const profile of loadArgument.slice('--load='.length).split(','))
      run(process.execPath, ['load/run.mjs', profile]);
  else if (workerTraffic) run(process.execPath, ['load/worker-traffic.mjs']);
  else if (faultLoad) run(process.execPath, ['load/fault-under-load.mjs']);
  else runNpm(['exec', '--', 'playwright', 'test', ...forwarded]);
}

let code = 0;
try {
  await main();
} catch (error) {
  code = 1;
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
} finally {
  await stop();
}
process.exitCode = code;
