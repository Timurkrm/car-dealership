import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname, sep } from 'node:path';
import ts from 'typescript';

const root = resolve('.');
const edges = new Map();
const failures = [];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.next', '.test-build'].includes(entry.name))
      return [];
    const path = resolve(dir, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : /\.tsx?$/.test(entry.name)
        ? [path]
        : [];
  });
}
for (const file of walk(resolve('apps'))) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const local = relative(root, file).split(sep).join('/');
  const owner = local.match(/^apps\/api\/src\/modules\/([^/]+)\//)?.[1];
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
      continue;
    const specifier = node.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) continue;
    const value = specifier.text;
    if (
      local.startsWith('apps/web/') &&
      (value.includes('@marketplace/api') || value.includes('apps/api'))
    )
      failures.push(`${local}: frontend must not import backend`);
    if (!value.startsWith('.')) continue;
    const target = relative(root, resolve(dirname(file), value))
      .split(sep)
      .join('/');
    if (local.startsWith('apps/web/') && target.startsWith('apps/api/'))
      failures.push(`${local}: frontend must not import backend`);
    const match = target.match(/^apps\/api\/src\/modules\/([^/]+)(?:\/(.*))?$/);
    if (!owner || !match || match[1] === owner) continue;
    if (match[2] && !/^index(?:\.ts)?$/.test(match[2]))
      failures.push(`${local}: use ${match[1]}'s public index`);
    if (!edges.has(owner)) edges.set(owner, new Set());
    edges.get(owner).add(match[1]);
  }
}
function visit(module, path = []) {
  if (path.includes(module)) {
    failures.push(`Module cycle: ${[...path, module].join(' -> ')}`);
    return;
  }
  for (const next of edges.get(module) ?? []) visit(next, [...path, module]);
}
for (const module of edges.keys()) visit(module);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Module boundaries passed');
