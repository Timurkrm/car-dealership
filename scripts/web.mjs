import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const envPath = resolve('../../.env');
if (existsSync(envPath)) loadEnvFile(envPath);
const action = process.argv[2];
if (!['dev', 'start'].includes(action))
  throw new Error('Expected dev or start');
const port = process.env.WEB_PORT;
if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('WEB_PORT must be a valid port');
// Next sets its own NODE_ENV. Do not carry the API's development value into next start.
delete process.env.NODE_ENV;
const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), action, '-p', port],
  { stdio: 'inherit' },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
