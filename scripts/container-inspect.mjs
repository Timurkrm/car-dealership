import { spawnSync } from 'node:child_process';

const images = [
  process.env.BACKEND_IMAGE ?? 'marketplace-backend:0.1.0-rc.1',
  process.env.WEB_IMAGE ?? 'marketplace-web:0.1.0-rc.1',
];

for (const image of images) {
  const metadata = JSON.parse(
    run('docker', ['image', 'inspect', image, '--format', '{{json .Config}}']),
  );
  if (!metadata.User || metadata.User === '0' || metadata.User === 'root')
    throw new Error(`${image} runs as root`);
  const files = run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'node',
    image,
    '-e',
    "const fs=require('fs');const forbidden=['.git','.env','e2e','load','qa-results','apps/api/test','apps/web/src'];for(const p of forbidden)if(fs.existsSync('/app/'+p)){console.error(p);process.exitCode=1}",
  ]);
  if (files.trim()) throw new Error(`${image} contains forbidden paths`);
  process.stdout.write(`PASS ${image} non-root and runtime-only\n`);
}

for (const command of [
  'apps/api/dist/main.js',
  'apps/api/dist/main-media-worker.js',
  'apps/api/dist/main-engagement-worker.js',
  'apps/api/dist/main-delivery-worker.js',
  'apps/api/dist/platform/database/data-source.js',
]) {
  run('docker', [
    'run',
    '--rm',
    '--entrypoint',
    'node',
    images[0],
    '-e',
    `if(!require('fs').existsSync('/app/${command}'))process.exit(1)`,
  ]);
  process.stdout.write(`PASS backend artifact ${command}\n`);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} failed with exit ${result.status}`);
  }
  return result.stdout ?? '';
}
