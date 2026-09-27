import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { EmailDeliveryRecords } from './modules/email-delivery';

async function main() {
  const id = process.argv[2];
  if (
    id &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new Error('Delivery ID must be a UUID');
  const app = await NestFactory.createApplicationContext(
    AppModule.register(loadConfig()),
    { logger: false, abortOnError: false },
  );
  try {
    await app.get(EmailDeliveryRecords).retryFailed(id);
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  process.stderr.write('Email delivery retry failed\n');
  process.exitCode = 1;
});
