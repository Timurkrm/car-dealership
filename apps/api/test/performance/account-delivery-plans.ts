import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { createSchemaDatabase } from '../support/schema-database';

interface ExplainNode {
  'Node Type'?: string;
  'Index Name'?: string;
  Plans?: ExplainNode[];
}
const indexes = (node: ExplainNode): string[] => [
  ...(node['Index Name'] ? [node['Index Name']] : []),
  ...(node.Plans ?? []).flatMap(indexes),
];

async function main() {
  const database = await createSchemaDatabase();
  const { source } = database;
  try {
    await source.runMigrations();
    const users = 10000;
    const sessions = 30000;
    const notifications = 100000;
    const deliveries = 100000;
    await source.query(
      `INSERT INTO users(id,email_normalized,display_name,status,email_verified_at)
       SELECT md5('account-user-'||n)::uuid,'account-'||n||'@example.test',
       'Account user '||n,'ACTIVE',CURRENT_TIMESTAMP FROM generate_series(1,$1) n`,
      [users],
    );
    await source.query(
      `INSERT INTO user_sessions(id,user_id,expires_at,last_used_at,created_at)
       SELECT md5('account-session-'||n)::uuid,
       md5('account-user-'||(1+(n%$2)))::uuid,'2100-01-01',
       '2026-09-01'::timestamptz+n*interval '1 second',
       '2026-01-01'::timestamptz+n*interval '1 second'
       FROM generate_series(1,$1) n`,
      [sessions, users],
    );
    await source.query(
      `INSERT INTO notification_preferences(user_id,messages_email_enabled,saved_searches_email_enabled,favorites_email_enabled,moderation_email_enabled)
       SELECT md5('account-user-'||n)::uuid,n%2=0,n%3=0,n%4<>0,true
       FROM generate_series(1,$1) n`,
      [users],
    );
    await source.query(
      `INSERT INTO notifications(id,user_id,type,payload,created_at)
       SELECT md5('account-notification-'||n)::uuid,
       md5('account-user-'||(1+(n%$2)))::uuid,'ACCOUNT_STATUS_CHANGED',
       '{"schemaVersion":1,"accountStatus":"ACTIVE","reasonCode":"PLAN"}'::jsonb,
       '2026-01-01'::timestamptz+n*interval '1 second'
       FROM generate_series(1,$1) n`,
      [notifications, users],
    );
    await source.query(
      `INSERT INTO notification_deliveries(
        id,notification_id,user_id,template,status,mandatory,dedupe_key,payload,
        attempts,available_at,locked_at,created_at,updated_at)
       SELECT md5('account-delivery-'||n)::uuid,md5('account-notification-'||n)::uuid,
       md5('account-user-'||(1+(n%$2)))::uuid,'ACCOUNT_STATUS_CHANGED',
       CASE WHEN n<=1000 THEN 'PENDING' WHEN n<=1500 THEN 'PROCESSING' ELSE 'SENT' END,
       true,'plan:'||n,'{"schemaVersion":1,"accountStatus":"ACTIVE"}'::jsonb,
       CASE WHEN n<=1500 THEN 1 ELSE 0 END,
       CASE WHEN n<=1000 THEN '2026-01-01'::timestamptz ELSE '2100-01-01'::timestamptz END,
       CASE WHEN n>1000 AND n<=1500 THEN '2026-01-01'::timestamptz END,
       '2026-01-01'::timestamptz+n*interval '1 second',
       '2026-01-01'::timestamptz+n*interval '1 second'
       FROM generate_series(1,$1) n`,
      [deliveries, users],
    );
    await source.query('ANALYZE');
    const userPrimary: Array<{ name: string }> = await source.query(
      `SELECT conname AS name FROM pg_constraint
       WHERE conrelid='users'::regclass AND contype='p'`,
    );
    const userPrimaryIndex = userPrimary[0]?.name;
    assert.ok(userPrimaryIndex);
    const cases = [
      {
        name: 'session list',
        expected: 'ix_user_sessions_user_created',
        sql: `SELECT id FROM user_sessions WHERE user_id=md5('account-user-2')::uuid AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC,id DESC LIMIT 50`,
      },
      {
        name: 'notification preferences',
        expected: 'uq_notification_preferences_user',
        sql: `SELECT * FROM notification_preferences WHERE user_id=md5('account-user-2')::uuid`,
      },
      {
        name: 'pending delivery claim',
        expected: 'ix_notification_deliveries_claim',
        sql: `SELECT id FROM notification_deliveries WHERE status IN ('PENDING','RETRY') AND available_at<=CURRENT_TIMESTAMP ORDER BY available_at,created_at,id LIMIT 50 FOR UPDATE SKIP LOCKED`,
      },
      {
        name: 'stale lease recovery',
        expected: 'ix_notification_deliveries_lease',
        sql: `SELECT id FROM notification_deliveries WHERE status='PROCESSING' AND locked_at<CURRENT_TIMESTAMP-INTERVAL '120 seconds' ORDER BY locked_at,id LIMIT 50`,
      },
      {
        name: 'batched recipient preparation',
        expected: userPrimaryIndex,
        sql: `SELECT id,email_normalized,email_verified_at,status FROM users WHERE id=ANY(ARRAY[md5('account-user-2')::uuid,md5('account-user-3')::uuid,md5('account-user-4')::uuid])`,
      },
    ];
    const results = [];
    for (const item of cases) {
      const rows = await source.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${item.sql}`,
      );
      const document = rows[0]?.['QUERY PLAN']?.[0];
      assert.ok(document);
      const selected = indexes(document.Plan);
      assert.ok(
        selected.includes(item.expected),
        `${item.name}: ${selected.join(', ')}`,
      );
      results.push({
        query: item.name,
        executionMs: document['Execution Time'],
        indexes: selected,
      });
    }
    process.stdout.write(
      `${JSON.stringify({ dataset: { users, sessions, notifications, deliveries }, results }, null, 2)}\n`,
    );
  } finally {
    await database.close();
  }
}
void main();
