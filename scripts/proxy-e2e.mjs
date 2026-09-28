import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwright = require.resolve('@playwright/test/cli');
const child = spawn(
  process.execPath,
  [playwright, 'test', '--project=chromium-desktop', '--grep=@proxy'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_BASE_URL: process.env.E2E_BASE_URL ?? 'https://localhost:8443',
      E2E_IGNORE_HTTPS_ERRORS: process.env.E2E_IGNORE_HTTPS_ERRORS ?? 'true',
    },
  },
);
child.once('error', (error) => {
  throw error;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
