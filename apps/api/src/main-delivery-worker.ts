import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config/config';
import { DeliveryWorkerApplication } from './delivery-worker.application';
import { StructuredLogger } from './platform/logging/structured-logger';
import {
  installProcessShutdown,
  ProcessLifecycle,
} from './platform/runtime/process-lifecycle';

async function main() {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(
    DeliveryWorkerApplication.register(config),
    { logger: false, abortOnError: false },
  );
  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  logger.event('info', 'Email delivery worker ready', {
    operation: 'email_delivery_worker_start',
  });
  installProcessShutdown({
    name: 'delivery-worker',
    config,
    lifecycle: app.get(ProcessLifecycle),
    logger,
    close: () => app.close(),
  });
}
void main().catch(() => {
  process.stderr.write('Email delivery worker startup failed\n');
  process.exitCode = 1;
});
