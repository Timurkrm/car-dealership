import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
for (const [path, args] of [
  [
    require.resolve('typescript/bin/tsc'),
    ['-p', 'apps/api/tsconfig.build.json'],
  ],
  ['apps/api/dist/platform/database/seed-catalog.js', []],
]) {
  const result = spawnSync(process.execPath, [path, ...args], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
