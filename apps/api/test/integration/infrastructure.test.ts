import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DeliveryWorkerApplication } from '../../src/delivery-worker.application';
import { EmailDeliveryWorker } from '../../src/modules/email-delivery';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { RedisConnection } from '../../src/platform/redis/redis.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';

test(
  'isolated infrastructure: migration, PostGIS, HTTP readiness, S3 and shutdown',
  { timeout: 30000 },
  async () => {
    const config = loadConfig('test');
    assert.ok(config.database.name.endsWith('_test'));
    const app = await NestFactory.create(AppModule.register(config), {
      bodyParser: false,
      logger: false,
      abortOnError: false,
    });
    configureApp(app, config);
    const database = app.get<DatabaseConnection>(DatabaseConnection);
    const redis = app.get<RedisConnection>(RedisConnection);
    try {
      await app.init();
      await database.source.runMigrations();
      assert.deepEqual(await database.source.runMigrations(), []);
      const result: unknown = await database.source.query(
        'SELECT PostGIS_Version() AS version',
      );
      assert.ok(
        Array.isArray(result) &&
          result.length === 1 &&
          typeof result[0]?.version === 'string',
      );
      // Schema apply/rollback isolation is covered by the dedicated data-model suite.
      await database.check();
      await app.get<ObjectStorage>(ObjectStorage).checkBucket();
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      assert.equal((await fetch(`${origin}/api/v1/health`)).status, 200);
      const ready = await fetch(`${origin}/api/v1/health/ready`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: 'ok' });
      assert.equal((await fetch(`${origin}/api/docs-json`)).status, 404);
      await database.source.destroy();
      assert.equal((await fetch(`${origin}/api/v1/health/ready`)).status, 503);
      assert.equal((await fetch(`${origin}/api/v1/health`)).status, 200);
      await database.source.initialize();
    } finally {
      await app.close();
    }
    assert.equal(database.source.isInitialized, false);
    await assert.rejects(() => redis.check());

    const worker = await NestFactory.createApplicationContext(
      DeliveryWorkerApplication.register(config),
      { logger: false, abortOnError: false },
    );
    try {
      assert.ok(worker.get(EmailDeliveryWorker));
    } finally {
      await worker.close();
    }
  },
);
