import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { OutboxRecords } from './modules/outbox';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const id = process.argv[2];
  if (id && !uuid.test(id)) throw new Error('Expected an optional event UUID');
  const app = await NestFactory.createApplicationContext(
    AppModule.register(loadConfig()),
    { logger: false, abortOnError: false },
  );
  try {
    const count = await app.get(OutboxRecords).recoverFailed(id);
    process.stdout.write(
      `${JSON.stringify({ recovered: count, id: id ?? null })}\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  process.stderr.write('Outbox recovery failed\n');
  process.exitCode = 1;
});
