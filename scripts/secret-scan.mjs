import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const excluded = new Set([
  '.git',
  '.next',
  '.test-build',
  '.tools',
  'backups',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'qa-results',
  'test-results',
]);
const extensions = new Set([
  '',
  '.cjs',
  '.env',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const signatures = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/],
  ['GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/],
];
const findings = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        relative(root, path).replaceAll('\\', '/') ===
        'apps/web/public/maplibre'
      )
        continue;
      visit(path);
      continue;
    }
    if (!entry.isFile() || !extensions.has(extname(entry.name))) continue;
    if (statSync(path).size > 5_000_000) continue;
    const text = readFileSync(path, 'utf8');
    if (text.includes('\0')) continue;
    for (const [name, pattern] of signatures)
      if (pattern.test(text)) findings.push(`${relative(root, path)}: ${name}`);
  }
}

visit(root);
if (findings.length) {
  process.stderr.write(
    `Potential committed secrets:\n${findings.join('\n')}\n`,
  );
  process.exitCode = 1;
} else process.stdout.write('High-confidence repository secret scan passed\n');
