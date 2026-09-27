import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { loadConfig } from '../../src/config/config';
import { databaseOptions } from '../../src/platform/database/database-options';
import {
  runMaintenanceCleanup,
  verifyDataIntegrity,
} from '../../src/operations/operational-data';
import {
  boundedClose,
  ProcessLifecycle,
} from '../../src/platform/runtime/process-lifecycle';
import { createSchemaDatabase } from '../support/schema-database';

const silentLogger = { event: () => undefined };

test(
  'production hardening: bounded cleanup, advisory lock, pool recovery and shutdown timeout',
  { timeout: 30000 },
  async () => {
    const owned = await createSchemaDatabase();
    const base = loadConfig('test');
    const name = String(owned.source.options.database);
    const config = {
      ...base,
      database: { ...base.database, name },
      retention: {
        ...base.retention,
        authTokenDays: 30,
        outboxProcessedDays: 30,
        deliverySentDays: 30,
        cleanupBatchSize: 1,
        cleanupMaxRows: 2,
      },
    };
    try {
      await owned.source.runMigrations();
      const userId = randomUUID();
      await owned.source.query(
        `INSERT INTO users(id,email_normalized,display_name,status,email_verified_at)
         VALUES ($1,$2,'Ops fixture','ACTIVE',CURRENT_TIMESTAMP)`,
        [userId, `ops-${userId}@example.test`],
      );
      for (let index = 0; index < 3; index++) {
        const sessionId = randomUUID();
        await owned.source.query(
          `INSERT INTO user_sessions(id,user_id,created_at,expires_at,revoked_at)
           VALUES ($1,$2,CURRENT_TIMESTAMP - INTERVAL '101 days',
                   CURRENT_TIMESTAMP - INTERVAL '100 days',
                   CURRENT_TIMESTAMP - INTERVAL '100 days')`,
          [sessionId, userId],
        );
        await owned.source.query(
          `INSERT INTO auth_action_tokens(
             user_id,purpose,token_hash,created_at,expires_at,consumed_at
           ) VALUES ($1,'PASSWORD_RESET',$2,
             CURRENT_TIMESTAMP - INTERVAL '101 days',
             CURRENT_TIMESTAMP - INTERVAL '100 days',
             CURRENT_TIMESTAMP - INTERVAL '100 days')`,
          [userId, index.toString(16).padStart(64, 'a')],
        );
        await owned.source.query(
          `INSERT INTO outbox_events(
             type,aggregate_type,aggregate_id,payload,occurred_at,status,
             available_at,processed_at
           ) VALUES ('MESSAGE_CREATED','MESSAGE',$1,'{}',
             CURRENT_TIMESTAMP - INTERVAL '100 days','PROCESSED',
             CURRENT_TIMESTAMP - INTERVAL '100 days',
             CURRENT_TIMESTAMP - INTERVAL '100 days')`,
          [randomUUID()],
        );
        await owned.source.query(
          `INSERT INTO notification_deliveries(
             user_id,channel,template,status,mandatory,dedupe_key,payload,
             attempts,available_at,created_at,updated_at,sent_at
           ) VALUES ($1,'EMAIL','PASSWORD_RESET','SENT',true,$2,
             '{"schemaVersion":"1"}',1,CURRENT_TIMESTAMP - INTERVAL '100 days',
             CURRENT_TIMESTAMP - INTERVAL '100 days',
             CURRENT_TIMESTAMP - INTERVAL '100 days',
             CURRENT_TIMESTAMP - INTERVAL '100 days')`,
          [userId, `ops-cleanup-${index}`],
        );
      }
      await owned.source.query(
        `INSERT INTO outbox_events(
           type,aggregate_type,aggregate_id,payload,occurred_at,status,
           available_at,last_error_code
         ) VALUES ('MESSAGE_CREATED','MESSAGE',$1,'{}',CURRENT_TIMESTAMP,
                   'FAILED',CURRENT_TIMESTAMP,'POISON')`,
        [randomUUID()],
      );

      const dry = await runMaintenanceCleanup(
        owned.source,
        config,
        silentLogger,
        true,
      );
      assert.equal(dry.acquired, true);
      assert.equal(dry.rows.auth_action_tokens, 3);
      assert.equal(dry.rows.expired_sessions, 3);

      const lock = owned.source.createQueryRunner();
      await lock.connect();
      await lock.query(
        `SELECT pg_advisory_lock(hashtext('marketplace-maintenance-cleanup'))`,
      );
      try {
        const concurrent = await runMaintenanceCleanup(
          owned.source,
          config,
          silentLogger,
          true,
        );
        assert.equal(concurrent.acquired, false);
      } finally {
        await lock.query(
          `SELECT pg_advisory_unlock(hashtext('marketplace-maintenance-cleanup'))`,
        );
        await lock.release();
      }

      const cleaned = await runMaintenanceCleanup(
        owned.source,
        config,
        silentLogger,
        false,
      );
      assert.equal(cleaned.rows.auth_action_tokens, 2);
      assert.equal(cleaned.rows.expired_sessions, 2);
      assert.equal(cleaned.rows.processed_outbox, 2);
      assert.equal(cleaned.rows.sent_deliveries, 2);
      const protectedRows: Array<{ count: number }> = await owned.source.query(
        `SELECT count(*)::integer AS count FROM outbox_events WHERE status='FAILED'`,
      );
      assert.equal(protectedRows[0]?.count, 1);
      const second = await runMaintenanceCleanup(
        owned.source,
        config,
        silentLogger,
        false,
      );
      assert.equal(second.rows.auth_action_tokens, 1);
      const third = await runMaintenanceCleanup(
        owned.source,
        config,
        silentLogger,
        false,
      );
      assert.deepEqual(third.rows, {
        auth_action_tokens: 0,
        expired_sessions: 0,
        processed_outbox: 0,
        sent_deliveries: 0,
      });
      await owned.source.query(
        `INSERT INTO auth_action_tokens(
           user_id,purpose,token_hash,created_at,expires_at,consumed_at
         ) VALUES ($1,'PASSWORD_RESET',$2,
           CURRENT_TIMESTAMP - INTERVAL '101 days',
           CURRENT_TIMESTAMP - INTERVAL '100 days',
           CURRENT_TIMESTAMP - INTERVAL '100 days')`,
        [userId, 'b'.repeat(64)],
      );
      await owned.source.query(
        `INSERT INTO notification_deliveries(
           user_id,channel,template,status,mandatory,dedupe_key,payload,
           attempts,available_at,created_at,updated_at,sent_at
         ) VALUES ($1,'EMAIL','PASSWORD_RESET','SENT',true,'ops-poison-row',
           '{"schemaVersion":"1"}',1,CURRENT_TIMESTAMP - INTERVAL '100 days',
           CURRENT_TIMESTAMP - INTERVAL '100 days',
           CURRENT_TIMESTAMP - INTERVAL '100 days',
           CURRENT_TIMESTAMP - INTERVAL '100 days')`,
        [userId],
      );
      await owned.source.query(
        `CREATE FUNCTION reject_auth_cleanup() RETURNS trigger LANGUAGE plpgsql
         AS $$ BEGIN RAISE EXCEPTION 'synthetic poison row'; END $$`,
      );
      await owned.source.query(
        `CREATE TRIGGER reject_auth_cleanup BEFORE DELETE ON auth_action_tokens
         FOR EACH ROW EXECUTE FUNCTION reject_auth_cleanup()`,
      );
      const poison = await runMaintenanceCleanup(
        owned.source,
        config,
        silentLogger,
        false,
      );
      assert.deepEqual(poison.failedCategories, ['auth_action_tokens']);
      assert.equal(poison.rows.sent_deliveries, 1);
      await owned.source.query(
        'DROP TRIGGER reject_auth_cleanup ON auth_action_tokens',
      );
      await owned.source.query('DROP FUNCTION reject_auth_cleanup()');
      const findings = await verifyDataIntegrity(owned.source, config);
      assert.equal(
        findings.some((finding) => finding.critical && finding.count > 0),
        false,
      );

      await verifyPoolExhaustion(config);
      await verifyBoundedShutdown(config);
    } finally {
      await owned.close();
    }
  },
);

async function verifyPoolExhaustion(config: ReturnType<typeof loadConfig>) {
  const source = new DataSource(
    databaseOptions({
      ...config,
      database: {
        ...config.database,
        poolMax: 2,
        connectionTimeoutMs: 250,
      },
    }),
  );
  await source.initialize();
  const first = source.createQueryRunner();
  const second = source.createQueryRunner();
  await first.connect();
  await second.connect();
  try {
    await assert.rejects(() => source.query('SELECT 1'));
    await first.release();
    assert.deepEqual(await source.query('SELECT 1 AS value'), [{ value: 1 }]);
  } finally {
    if (!first.isReleased) await first.release();
    await second.release();
    await source.destroy();
  }
}

async function verifyBoundedShutdown(config: ReturnType<typeof loadConfig>) {
  const lifecycle = new ProcessLifecycle();
  let forced = false;
  lifecycle.beginShutdown();
  await assert.rejects(() =>
    boundedClose({
      name: 'test',
      config: {
        ...config,
        runtime: { ...config.runtime, shutdownTimeoutMs: 20 },
      },
      lifecycle,
      logger: silentLogger,
      close: () => new Promise<void>(() => undefined),
      force: () => {
        forced = true;
      },
    }),
  );
  assert.equal(forced, true);
}
