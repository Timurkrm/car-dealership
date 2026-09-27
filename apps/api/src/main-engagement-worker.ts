import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config/config';
import { EngagementWorkerApplication } from './engagement-worker.application';
import { StructuredLogger } from './platform/logging/structured-logger';
import {
  installProcessShutdown,
  ProcessLifecycle,
} from './platform/runtime/process-lifecycle';

async function main() {
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(
    EngagementWorkerApplication.register(config),
    { logger: false, abortOnError: false },
  );
  const logger = app.get(StructuredLogger);
  app.useLogger(logger);
  logger.event('info', 'Engagement worker ready', {
    operation: 'engagement_worker_start',
  });
  installProcessShutdown({
    name: 'engagement-worker',
    config,
    lifecycle: app.get(ProcessLifecycle),
    logger,
    close: () => app.close(),
  });
}

void main().catch(() => {
  process.stderr.write('Engagement worker startup failed\n');
  process.exitCode = 1;
});
