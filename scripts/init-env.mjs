import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

for (const name of ['.env', '.env.test']) {
  if (existsSync(name)) {
    const existing = readFileSync(name, 'utf8');
    const additions = readFileSync(`${name}.example`, 'utf8')
      .split(/\r?\n/)
      .filter((line) => {
        const key = line.match(/^([A-Z_]+)=/)?.[1];
        return (
          (key?.startsWith('AUTH_') || key?.startsWith('MEDIA_')) &&
          !new RegExp(`^${key}=`, 'm').test(existing)
        );
      })
      .map((line) =>
        line.replace(/replace-with-generated-[a-z-]+/g, () =>
          randomBytes(32).toString('hex'),
        ),
      );
    if (additions.length)
      writeFileSync(name, `${existing.trimEnd()}\n${additions.join('\n')}\n`, {
        mode: 0o600,
      });
    console.log(
      `${name} existing credentials preserved; missing auth/media configuration initialized`,
    );
    continue;
  }
  const text = readFileSync(`${name}.example`, 'utf8').replace(
    /replace-with-generated-[a-z-]+/g,
    () => randomBytes(32).toString('hex'),
  );
  writeFileSync(name, text, { mode: 0o600, flag: 'wx' });
  console.log(`Created ${name} with private local credentials`);
}
