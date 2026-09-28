import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const version = packageJson.version;
if (!/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(version))
  throw new Error('Root package version must be SemVer or SemVer RC');
const sha = (
  process.env.GITHUB_SHA ??
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
).trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('Invalid Git commit SHA');
const metadata = {
  version,
  gitSha: sha,
  shortSha: sha.slice(0, 12),
  node: process.version,
  createdAt: new Date().toISOString(),
};
process.stdout.write(`${JSON.stringify(metadata)}\n`);
