import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const root = process.cwd();
const files = markdownFiles(root).filter(
  (path) =>
    !path.includes('node_modules') &&
    !path.includes('.git') &&
    !path.includes('.tools'),
);
const failures = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  // Repository guidance illustrates forbidden paths with literal ellipsis-only
  // examples. Ignore only those complete placeholder lines, never real paths.
  const pathContent = content.replace(
    /^(?:[A-Za-z]:[\\/]Users[\\/]\.\.\.|file:\/\/\.\.\.)\r?$/gm,
    '',
  );
  if (
    /[A-Za-z]:[\\/]Users[\\/]/.test(pathContent) ||
    /file:\/\//i.test(pathContent)
  )
    failures.push(`${relative(file)}: contains a developer absolute path`);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1]?.trim().replace(/^<|>$/g, '');
    if (!raw || raw.startsWith('#') || /^(https?:|mailto:|app:)/i.test(raw))
      continue;
    const path = decodeURIComponent(raw.split('#')[0] ?? '');
    if (path && !existsSync(resolve(dirname(file), path)))
      failures.push(`${relative(file)}: missing link target ${raw}`);
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Markdown link/path audit passed (${files.length} files)\n`,
  );
}

function markdownFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', '.tools'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...markdownFiles(path));
    else if (extname(entry.name).toLowerCase() === '.md') output.push(path);
  }
  return output;
}

function relative(path) {
  return path.slice(root.length + 1).replaceAll('\\', '/');
}
