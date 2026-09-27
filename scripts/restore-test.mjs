import { closeSync, existsSync, openSync, rmSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (existsSync('.env.test')) loadEnvFile('.env.test');
if (
  process.env.NODE_ENV !== 'test' ||
  !process.env.DATABASE_NAME?.endsWith('_test')
)
  throw new Error('Restore drill is restricted to the isolated test database');
const require = createRequire(import.meta.url);
const suffix = `${process.pid}`;
const databaseBase = process.env.DATABASE_NAME.slice(0, -'_test'.length);
const sourceName = `${databaseBase}_restore_source_${suffix}_test`;
const targetName = `${databaseBase}_restore_target_${suffix}_test`;
const dumpPath = join(tmpdir(), `marketplace-restore-${suffix}.dump`);
const compose = [
  'compose',
  '-p',
  'marketplace-test',
  '--env-file',
  '.env.test',
];
const docker = (...args) => run('docker', [...compose, ...args]);
const psql = (database, sql, capture = false) =>
  run(
    'docker',
    [
      ...compose,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      process.env.DATABASE_USER,
      '-d',
      database,
      '-At',
      '-c',
      sql,
    ],
    capture,
  );
const databaseSql = (name) => {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Unsafe database name');
  return `"${name}"`;
};
try {
  docker('ps');
  psql(
    'postgres',
    `DROP DATABASE IF EXISTS ${databaseSql(sourceName)} WITH (FORCE)`,
  );
  psql(
    'postgres',
    `DROP DATABASE IF EXISTS ${databaseSql(targetName)} WITH (FORCE)`,
  );
  psql(
    'postgres',
    `CREATE DATABASE ${databaseSql(sourceName)} TEMPLATE template0`,
  );
  run(
    process.execPath,
    ['../../scripts/migration.mjs', 'run'],
    false,
    'apps/api',
    { DATABASE_NAME: sourceName },
  );
  run(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    '-p',
    'apps/api/tsconfig.test.json',
  ]);
  run(
    process.execPath,
    ['apps/api/.test-build/test/operations/restore-fixture.js'],
    false,
    '.',
    { DATABASE_NAME: sourceName },
  );

  const dumpFd = openSync(dumpPath, 'wx');
  try {
    run(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        'postgres',
        'pg_dump',
        '-U',
        process.env.DATABASE_USER,
        '-d',
        sourceName,
        '--format=custom',
        '--no-owner',
        '--no-privileges',
      ],
      false,
      '.',
      {},
      dumpFd,
    );
  } finally {
    closeSync(dumpFd);
  }
  psql(
    'postgres',
    `CREATE DATABASE ${databaseSql(targetName)} TEMPLATE template0`,
  );
  const restoreFd = openSync(dumpPath, 'r');
  try {
    run(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        'postgres',
        'pg_restore',
        '-U',
        process.env.DATABASE_USER,
        '-d',
        targetName,
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
      ],
      false,
      '.',
      {},
      undefined,
      restoreFd,
    );
  } finally {
    closeSync(restoreFd);
  }
  run(
    process.execPath,
    ['apps/api/dist/operations/ops-verify-data-command.js'],
    false,
    '.',
    { DATABASE_NAME: targetName },
  );
  const verification = psql(
    targetName,
    `SELECT json_build_object(
       'users',(SELECT count(*) FROM users),
       'listings',(SELECT count(*) FROM listings),
       'vehicles',(SELECT count(*) FROM vehicle_listings),
       'parts',(SELECT count(*) FROM part_listings),
       'media',(SELECT count(*) FROM listing_media),
       'messages',(SELECT count(*) FROM messages),
       'notifications',(SELECT count(*) FROM notifications),
       'outbox',(SELECT count(*) FROM outbox_events),
       'moderation',(SELECT count(*) FROM moderation_actions),
       'postgis',(SELECT count(*) FROM listing_locations
                  WHERE ST_DWithin(point::geography,
                    ST_SetSRID(ST_MakePoint(4.9041,52.3676),4326)::geography,100))
     )`,
    true,
  ).trim();
  const counts = JSON.parse(verification);
  for (const key of [
    'users',
    'listings',
    'vehicles',
    'parts',
    'media',
    'messages',
    'notifications',
    'outbox',
    'moderation',
    'postgis',
  ])
    if (!(Number(counts[key]) > 0)) throw new Error(`Restore missing ${key}`);
  process.stdout.write(
    `${JSON.stringify({ sourceDatabase: sourceName, targetDatabase: targetName, counts })}\n`,
  );
} finally {
  try {
    psql(
      'postgres',
      `DROP DATABASE IF EXISTS ${databaseSql(targetName)} WITH (FORCE)`,
    );
    psql(
      'postgres',
      `DROP DATABASE IF EXISTS ${databaseSql(sourceName)} WITH (FORCE)`,
    );
  } finally {
    rmSync(dumpPath, { force: true });
  }
}

function run(
  command,
  args,
  capture = false,
  cwd = '.',
  extraEnv = {},
  stdoutFd,
  stdinFd,
) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: capture ? 'utf8' : undefined,
    stdio: capture
      ? ['ignore', 'pipe', 'inherit']
      : [stdinFd ?? 'ignore', stdoutFd ?? 'inherit', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with exit ${result.status}`);
  return capture ? result.stdout : '';
}
