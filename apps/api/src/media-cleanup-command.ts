import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { MediaCleanup } from './modules/media';
async function main() {
  const app = await NestFactory.createApplicationContext(
    AppModule.register(loadConfig()),
    { logger: false, abortOnError: false },
  );
  try {
    await app.get(MediaCleanup).dispatch();
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  process.stderr.write('Media cleanup dispatch failed\n');
  process.exitCode = 1;
});
