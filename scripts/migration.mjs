import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [action, name] = process.argv.slice(2);
if (!['create', 'generate', 'run', 'revert'].includes(action))
  throw new Error('Unknown migration action');
if (
  ['create', 'generate'].includes(action) &&
  !/^[A-Z][A-Za-z0-9]+$/.test(name ?? '')
)
  throw new Error('Supply a migration name, e.g. AddVehicleSchema');
function run(path, args) {
  const result = spawnSync(process.execPath, [path, ...args], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const cli = require.resolve('typeorm/cli.js');
if (action !== 'create')
  run(require.resolve('typescript/bin/tsc'), ['-p', 'tsconfig.build.json']);
const args = [`migration:${action}`];
if (name) args.push(`src/platform/database/migrations/${name}`);
if (action !== 'create')
  args.push('-d', 'dist/platform/database/data-source.js');
run(cli, args);
