import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig, ConfigurationError } from './config/config';
import { configureApp } from './bootstrap';
import { StructuredLogger } from './platform/logging/structured-logger';
import { RealtimeIoAdapter } from './platform/realtime/realtime-io.adapter';
import {
  installProcessShutdown,
  ProcessLifecycle,
} from './platform/runtime/process-lifecycle';

async function main(): Promise<void> {
  let app: INestApplication | undefined;
  try {
    const config = loadConfig();
    app = await NestFactory.create(AppModule.register(config), {
      bodyParser: false,
      logger: false,
      abortOnError: false,
    });
    configureApp(app, config);
    const realtimeAdapter = new RealtimeIoAdapter(
      app,
      config,
      app.get(StructuredLogger),
    );
    await realtimeAdapter.connect();
    app.useWebSocketAdapter(realtimeAdapter);
    const server = await app.listen(config.port, '0.0.0.0');
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    installProcessShutdown({
      name: 'api',
      config,
      lifecycle: app.get(ProcessLifecycle),
      logger: app.get(StructuredLogger),
      close: async () => {
        await new Promise<void>((resolve, reject) =>
          server.close((error?: Error) => (error ? reject(error) : resolve())),
        );
        await app?.close();
      },
      force: () => server.closeAllConnections(),
    });
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'api', operation: 'startup', message: error instanceof ConfigurationError ? error.message : 'API startup failed; check dependency availability and configuration' })}\n`,
    );
    if (app) await app.close();
    process.exitCode = 1;
  }
}
void main();
