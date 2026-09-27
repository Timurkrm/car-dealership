import { createWriteStream, existsSync, rmSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { finished } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
if (outputIndex < 0 || !args[outputIndex + 1])
  throw new Error('Usage: npm run db:backup -- --output <file.dump>');
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
if (existsSync(envFile)) loadEnvFile(envFile);
if (process.env.NODE_ENV === 'production' && !args.includes('--confirm'))
  throw new Error('Production backup requires --confirm');
const output = resolve(args[outputIndex + 1]);
if (existsSync(output)) throw new Error('Backup output already exists');
if (!existsSync(dirname(output)))
  throw new Error('Backup directory is missing');
const required = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
];
for (const key of required)
  if (!process.env[key]) throw new Error(`${key} is required`);
const executable = process.env.PG_DUMP_BIN ?? 'pg_dump';
const child = spawn(
  executable,
  [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--host',
    process.env.DATABASE_HOST,
    '--port',
    process.env.DATABASE_PORT,
    '--username',
    process.env.DATABASE_USER,
    '--dbname',
    process.env.DATABASE_NAME,
  ],
  {
    env: { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD },
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
const destination = createWriteStream(output, { flags: 'wx' });
child.stdout.pipe(destination);
try {
  const code = await new Promise((resolveCode, reject) => {
    child.once('error', reject);
    child.once('exit', resolveCode);
  });
  if (code !== 0) throw new Error('pg_dump failed');
  await finished(destination);
  process.stdout.write(`Backup created: ${output}\n`);
} catch (error) {
  destination.destroy();
  rmSync(output, { force: true });
  throw error;
}
