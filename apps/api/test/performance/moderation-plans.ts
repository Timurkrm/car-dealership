import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { createSchemaDatabase } from '../support/schema-database';

interface ExplainNode {
  'Node Type'?: string;
  'Index Name'?: string;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  Plans?: ExplainNode[];
}
function indexes(node: ExplainNode): string[] {
  return [
    ...(node['Index Name'] ? [node['Index Name']] : []),
    ...(node.Plans ?? []).flatMap(indexes),
  ];
}
async function main() {
  const database = await createSchemaDatabase();
  const { source } = database;
  try {
    await source.runMigrations();
    await source.query(`
      INSERT INTO users(id,email_normalized,display_name,status,created_at,updated_at,email_verified_at)
      SELECT gen_random_uuid(), 'plan-' || n || '@example.test', 'Plan user ' || n,
             CASE WHEN n <= 100 THEN 'BLOCKED' ELSE 'ACTIVE' END,
             '2025-01-01'::timestamptz + n * interval '1 second',
             '2025-01-01'::timestamptz + n * interval '1 second', CURRENT_TIMESTAMP
      FROM generate_series(1,30000) n`);
    await source.query(
      `INSERT INTO user_roles(user_id,role) SELECT id,'USER' FROM users`,
    );
    await source.query(`
      INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status,submitted_at,created_at,updated_at)
      SELECT gen_random_uuid(), (SELECT id FROM users ORDER BY created_at LIMIT 1), 'VEHICLE',
             'Plan listing ' || n, 'description', 10000, 'EUR',
             CASE WHEN n <= 200 THEN 'PENDING_MODERATION' ELSE 'DRAFT' END,
             CASE WHEN n <= 200 THEN '2026-01-01'::timestamptz + n * interval '1 minute' END,
             '2025-01-01'::timestamptz + n * interval '1 second',
             '2025-01-01'::timestamptz + n * interval '1 second'
      FROM generate_series(1,30000) n`);
    await source.query(`
      INSERT INTO reports(reporter_id,target_type,listing_id,reason_code,reason,status,created_at,updated_at)
      SELECT (SELECT id FROM users ORDER BY created_at LIMIT 1), 'LISTING', listing.id,
             'OTHER', 'fixture', 'OPEN',
             '2026-01-01'::timestamptz + row_number() OVER (ORDER BY listing.id) * interval '1 second',
             '2026-01-01'::timestamptz + row_number() OVER (ORDER BY listing.id) * interval '1 second'
      FROM listings listing
      LIMIT 30000`);
    await source.query(`
      UPDATE reports SET status = 'RESOLVED', resolved_at = created_at,
             resolved_by = reporter_id, resolution = 'NO_ACTION'
      WHERE created_at > '2026-01-01T00:03:20Z'`);
    await source.query(`
      INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,request_id,created_at)
      SELECT NULL, CASE WHEN numbered.n <= 200 THEN 'USER_BLOCKED' ELSE 'AUTH_LOGGED_IN' END,
             'USER', numbered.id, 'plan-review',
             '2026-01-01'::timestamptz + numbered.n * interval '1 second'
      FROM (SELECT id, row_number() OVER (ORDER BY created_at) n FROM users) numbered`);
    await source.query(
      'ANALYZE users; ANALYZE user_roles; ANALYZE listings; ANALYZE reports; ANALYZE audit_logs',
    );

    const cases = [
      {
        name: 'pending moderation queue',
        index: 'ix_listings_moderation_queue',
        sql: `SELECT id FROM listings WHERE status='PENDING_MODERATION' ORDER BY submitted_at,id LIMIT 20`,
      },
      {
        name: 'open report queue',
        index: 'ix_reports_status_queue',
        sql: `SELECT id FROM reports WHERE status='OPEN' ORDER BY created_at,id LIMIT 20`,
      },
      {
        name: 'filtered admin users',
        index: 'ix_users_admin_status_created',
        sql: `SELECT id FROM users WHERE status='BLOCKED' ORDER BY created_at DESC,id DESC LIMIT 20`,
      },
      {
        name: 'filtered audit timeline',
        index: 'ix_audit_logs_action_created',
        sql: `SELECT id FROM audit_logs WHERE action='USER_BLOCKED' ORDER BY created_at DESC,id DESC LIMIT 50`,
      },
    ];
    const results = [];
    for (const item of cases) {
      const rows = await source.query<
        {
          'QUERY PLAN': {
            Plan: ExplainNode;
            'Execution Time': number;
          }[];
        }[]
      >(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${item.sql}`);
      const document = rows[0]?.['QUERY PLAN'][0];
      assert.ok(document);
      const selected = indexes(document.Plan);
      assert.ok(
        selected.includes(item.index),
        `${item.name}: ${selected.join(', ')}`,
      );
      results.push({
        query: item.name,
        rows: document.Plan['Actual Rows'],
        executionMs: document['Execution Time'],
        indexes: selected,
      });
    }
    process.stdout.write(
      `${JSON.stringify({ dataset: { users: 30000, listings: 30000, reports: 30000, auditLogs: 30000 }, results }, null, 2)}\n`,
    );
  } finally {
    await database.close();
  }
}
void main();
