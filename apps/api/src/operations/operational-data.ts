import type { DataSource } from 'typeorm';
import type { AppConfig } from '../config/config';
import type { StructuredLogger } from '../platform/logging/structured-logger';

export interface IntegrityFinding {
  check: string;
  count: number;
  critical: boolean;
}

export async function verifyDataIntegrity(
  source: DataSource,
  config: AppConfig,
): Promise<IntegrityFinding[]> {
  const checks: Array<{
    check: string;
    critical: boolean;
    sql: string;
    parameters?: unknown[];
  }> = [
    {
      check: 'listing_subtype_mismatch',
      critical: true,
      sql: `SELECT count(*)::integer AS count
            FROM listings listing
            LEFT JOIN vehicle_listings vehicle ON vehicle.listing_id = listing.id
            LEFT JOIN part_listings part ON part.listing_id = listing.id
            WHERE (listing.type = 'VEHICLE' AND (vehicle.listing_id IS NULL OR part.listing_id IS NOT NULL))
               OR (listing.type = 'PART' AND (part.listing_id IS NULL OR vehicle.listing_id IS NOT NULL))`,
    },
    {
      check: 'published_without_ready_primary',
      critical: true,
      sql: `SELECT count(*)::integer AS count FROM listings listing
            WHERE listing.status = 'PUBLISHED' AND NOT EXISTS (
              SELECT 1 FROM listing_media media
              WHERE media.listing_id = listing.id
                AND media.status = 'READY' AND media.is_primary = true
            )`,
    },
    {
      check: 'published_part_without_stock',
      critical: true,
      sql: `SELECT count(*)::integer AS count
            FROM listings listing JOIN part_listings part ON part.listing_id = listing.id
            WHERE listing.status = 'PUBLISHED' AND part.quantity_available <= 0`,
    },
    {
      check: 'orphan_listing_location',
      critical: true,
      sql: `SELECT count(*)::integer AS count FROM listing_locations location
            LEFT JOIN listings listing ON listing.id = location.listing_id
            WHERE listing.id IS NULL`,
    },
    {
      check: 'orphan_media_variant',
      critical: true,
      sql: `SELECT count(*)::integer AS count FROM listing_media_variants variant
            LEFT JOIN listing_media media ON media.id = variant.media_id
            WHERE media.id IS NULL`,
    },
    {
      check: 'conversation_participant_invariant',
      critical: true,
      sql: `SELECT count(*)::integer AS count FROM conversations conversation
            JOIN listings listing ON listing.id = conversation.listing_id
            WHERE (SELECT count(*) FROM conversation_participants participant
                   WHERE participant.conversation_id = conversation.id) <> 2
               OR NOT EXISTS (SELECT 1 FROM conversation_participants participant
                              WHERE participant.conversation_id = conversation.id
                                AND participant.user_id = conversation.buyer_id)
               OR NOT EXISTS (SELECT 1 FROM conversation_participants participant
                              WHERE participant.conversation_id = conversation.id
                                AND participant.user_id = listing.seller_id)`,
    },
    {
      check: 'delivery_notification_orphan',
      critical: true,
      sql: `SELECT count(*)::integer AS count
            FROM notification_deliveries delivery
            LEFT JOIN notifications notification ON notification.id = delivery.notification_id
            WHERE delivery.notification_id IS NOT NULL AND notification.id IS NULL`,
    },
    {
      check: 'outbox_impossible_lease',
      critical: true,
      sql: `SELECT count(*)::integer AS count FROM outbox_events
            WHERE (status = 'PROCESSING' AND locked_at IS NULL)
               OR (status <> 'PROCESSING' AND locked_at IS NOT NULL)`,
    },
    {
      check: 'delivery_impossible_lease',
      critical: true,
      sql: `SELECT count(*)::integer AS count FROM notification_deliveries
            WHERE (status = 'PROCESSING' AND locked_at IS NULL)
               OR (status <> 'PROCESSING' AND locked_at IS NOT NULL)`,
    },
    {
      check: 'stale_outbox_lease',
      critical: false,
      sql: `SELECT count(*)::integer AS count FROM outbox_events
            WHERE status = 'PROCESSING'
              AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')`,
      parameters: [config.engagement.outboxLeaseSeconds],
    },
    {
      check: 'stale_delivery_lease',
      critical: false,
      sql: `SELECT count(*)::integer AS count FROM notification_deliveries
            WHERE status = 'PROCESSING'
              AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')`,
      parameters: [config.emailDelivery.leaseSeconds],
    },
  ];
  const findings: IntegrityFinding[] = [];
  for (const check of checks) {
    const rows: Array<{ count: number }> = await source.query(
      check.sql,
      check.parameters ?? [],
    );
    findings.push({
      check: check.check,
      count: Number(rows[0]?.count ?? 0),
      critical: check.critical,
    });
  }
  return findings;
}

export interface OperationalStatus {
  database: {
    postgresVersion: string;
    postgisVersion: string;
    connections: number;
    writable: boolean;
  };
  outbox: QueueStatus;
  delivery: QueueStatus;
  media: Record<string, number>;
  largestRelations: Array<{ relation: string; bytes: number }>;
  duplicateIndexCandidates: string[][];
}

interface QueueStatus {
  pending: number;
  retry: number;
  processing: number;
  failed: number;
  oldestPendingSeconds: number | null;
}

export async function operationalStatus(
  source: DataSource,
): Promise<OperationalStatus> {
  const [databaseRows, outboxRows, deliveryRows, mediaRows, sizes, duplicates] =
    await Promise.all([
      source.query<
        Array<{
          postgresVersion: string;
          postgisVersion: string;
          connections: number;
          writable: boolean;
        }>
      >(`SELECT current_setting('server_version') AS "postgresVersion",
                PostGIS_Version() AS "postgisVersion",
                (SELECT count(*)::integer FROM pg_stat_activity
                 WHERE datname = current_database()) AS connections,
                current_setting('transaction_read_only') = 'off' AS writable`),
      queueStatus(source, 'outbox_events'),
      queueStatus(source, 'notification_deliveries'),
      source.query<Array<{ status: string; count: number }>>(
        `SELECT status, count(*)::integer AS count
         FROM listing_media GROUP BY status ORDER BY status`,
      ),
      source.query<Array<{ relation: string; bytes: string }>>(
        `SELECT relname AS relation, pg_total_relation_size(relid)::text AS bytes
         FROM pg_catalog.pg_statio_user_tables
         ORDER BY pg_total_relation_size(relid) DESC LIMIT 10`,
      ),
      source.query<Array<{ indexes: string[] }>>(
        `SELECT array_agg(indexname ORDER BY indexname) AS indexes
         FROM pg_indexes WHERE schemaname = current_schema()
         GROUP BY regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ', '')
         HAVING count(*) > 1`,
      ),
    ]);
  const database = databaseRows[0];
  if (!database) throw new Error('OPS_STATUS_DATABASE_UNAVAILABLE');
  return {
    database,
    outbox: outboxRows,
    delivery: deliveryRows,
    media: Object.fromEntries(
      mediaRows.map((row) => [row.status, Number(row.count)]),
    ),
    largestRelations: sizes.map((row) => ({
      relation: row.relation,
      bytes: Number(row.bytes),
    })),
    duplicateIndexCandidates: duplicates.map((row) => row.indexes),
  };
}

async function queueStatus(
  source: DataSource,
  table: 'outbox_events' | 'notification_deliveries',
): Promise<QueueStatus> {
  const rows: QueueStatus[] = await source.query(
    `SELECT
       count(*) FILTER (WHERE status = 'PENDING')::integer AS pending,
       count(*) FILTER (WHERE status = 'RETRY')::integer AS retry,
       count(*) FILTER (WHERE status = 'PROCESSING')::integer AS processing,
       count(*) FILTER (WHERE status = 'FAILED')::integer AS failed,
       EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - min(created_at)
         FILTER (WHERE status IN ('PENDING','RETRY'))))::integer AS "oldestPendingSeconds"
     FROM ${table}`,
  );
  return (
    rows[0] ?? {
      pending: 0,
      retry: 0,
      processing: 0,
      failed: 0,
      oldestPendingSeconds: null,
    }
  );
}

interface CleanupTarget {
  category: string;
  countSql: string;
  deleteSql: string;
  retentionDays: number;
}

export interface CleanupResult {
  acquired: boolean;
  dryRun: boolean;
  rows: Record<string, number>;
  failedCategories: string[];
}

export async function runMaintenanceCleanup(
  source: DataSource,
  config: AppConfig,
  logger: Pick<StructuredLogger, 'event'>,
  dryRun: boolean,
): Promise<CleanupResult> {
  const runner = source.createQueryRunner();
  await runner.connect();
  try {
    const lock: Array<{ acquired: boolean }> = await runner.query(
      `SELECT pg_try_advisory_lock(hashtext('marketplace-maintenance-cleanup')) AS acquired`,
    );
    if (lock[0]?.acquired !== true)
      return { acquired: false, dryRun, rows: {}, failedCategories: [] };
    try {
      const targets = cleanupTargets(config);
      const rows: Record<string, number> = {};
      const failedCategories: string[] = [];
      for (const target of targets) {
        const started = performance.now();
        try {
          const affected = dryRun
            ? await plannedCount(runner, target)
            : await deleteBatches(runner, target, config);
          rows[target.category] = affected;
          logger.event('info', 'Maintenance category completed', {
            operation: 'maintenance_cleanup',
            table: target.category,
            rowsAffected: affected,
            durationMs: Math.round(performance.now() - started),
            dryRun,
          });
        } catch {
          rows[target.category] = 0;
          failedCategories.push(target.category);
          logger.event('error', 'Maintenance category failed', {
            operation: 'maintenance_cleanup',
            table: target.category,
            durationMs: Math.round(performance.now() - started),
            dryRun,
          });
        }
      }
      return { acquired: true, dryRun, rows, failedCategories };
    } finally {
      await runner.query(
        `SELECT pg_advisory_unlock(hashtext('marketplace-maintenance-cleanup'))`,
      );
    }
  } finally {
    await runner.release();
  }
}

function cleanupTargets(config: AppConfig): CleanupTarget[] {
  return [
    {
      category: 'auth_action_tokens',
      retentionDays: config.retention.authTokenDays,
      countSql: `SELECT count(*)::integer AS count FROM auth_action_tokens
                 WHERE expires_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`,
      deleteSql: `WITH candidates AS (
                    SELECT id FROM auth_action_tokens
                    WHERE expires_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
                    ORDER BY expires_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
                  ) DELETE FROM auth_action_tokens token USING candidates
                    WHERE token.id = candidates.id`,
    },
    {
      category: 'expired_sessions',
      retentionDays: config.retention.authTokenDays,
      countSql: `SELECT count(*)::integer AS count FROM user_sessions
                 WHERE expires_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`,
      deleteSql: `WITH candidates AS (
                    SELECT id FROM user_sessions
                    WHERE expires_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
                    ORDER BY expires_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
                  ) DELETE FROM user_sessions session USING candidates
                    WHERE session.id = candidates.id`,
    },
    {
      category: 'processed_outbox',
      retentionDays: config.retention.outboxProcessedDays,
      countSql: `SELECT count(*)::integer AS count FROM outbox_events event
                 WHERE status = 'PROCESSED'
                   AND processed_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
                   AND NOT EXISTS (SELECT 1 FROM notifications notification
                                   WHERE notification.source_event_id = event.id)`,
      deleteSql: `WITH candidates AS (
                    SELECT id FROM outbox_events event
                    WHERE status = 'PROCESSED'
                      AND processed_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
                      AND NOT EXISTS (SELECT 1 FROM notifications notification
                                      WHERE notification.source_event_id = event.id)
                    ORDER BY processed_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
                  ) DELETE FROM outbox_events event USING candidates
                    WHERE event.id = candidates.id`,
    },
    {
      category: 'sent_deliveries',
      retentionDays: config.retention.deliverySentDays,
      countSql: `SELECT count(*)::integer AS count FROM notification_deliveries
                 WHERE status IN ('SENT','SUPPRESSED')
                   AND updated_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')`,
      deleteSql: `WITH candidates AS (
                    SELECT id FROM notification_deliveries
                    WHERE status IN ('SENT','SUPPRESSED')
                      AND updated_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
                    ORDER BY updated_at, id LIMIT $2 FOR UPDATE SKIP LOCKED
                  ) DELETE FROM notification_deliveries delivery USING candidates
                    WHERE delivery.id = candidates.id`,
    },
  ];
}

async function plannedCount(
  runner: ReturnType<DataSource['createQueryRunner']>,
  target: CleanupTarget,
): Promise<number> {
  const rows: Array<{ count: number }> = await runner.query(target.countSql, [
    target.retentionDays,
  ]);
  return Number(rows[0]?.count ?? 0);
}

async function deleteBatches(
  runner: ReturnType<DataSource['createQueryRunner']>,
  target: CleanupTarget,
  config: AppConfig,
): Promise<number> {
  let total = 0;
  while (total < config.retention.cleanupMaxRows) {
    const limit = Math.min(
      config.retention.cleanupBatchSize,
      config.retention.cleanupMaxRows - total,
    );
    await runner.startTransaction();
    try {
      const result: unknown = await runner.query(target.deleteSql, [
        target.retentionDays,
        limit,
      ]);
      await runner.commitTransaction();
      const affected = affectedRows(result);
      total += affected;
      if (affected < limit) break;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
  }
  return total;
}

function affectedRows(result: unknown): number {
  if (!Array.isArray(result)) return 0;
  const value = result.at(-1);
  return typeof value === 'number' ? value : 0;
}
