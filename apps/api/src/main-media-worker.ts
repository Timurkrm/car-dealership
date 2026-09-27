import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config/config';
import { MediaWorkerApplication } from './media-worker.application';
import { StructuredLogger } from './platform/logging/structured-logger';
import {
  installProcessShutdown,
  ProcessLifecycle,
} from './platform/runtime/process-lifecycle';
async function main() {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(
    MediaWorkerApplication.register(config),
    {
      logger: false,
      abortOnError: false,
    },
  );
  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  logger.event('info', 'Media worker ready', {
    operation: 'media_worker_start',
  });
  installProcessShutdown({
    name: 'media-worker',
    config,
    lifecycle: app.get(ProcessLifecycle),
    logger,
    close: () => app.close(),
  });
}
void main().catch(() => {
  process.stderr.write('Media worker startup failed\n');
  process.exitCode = 1;
});
