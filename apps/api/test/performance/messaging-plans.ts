import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { createSchemaDatabase } from '../support/schema-database';

interface PlanNode {
  'Node Type'?: string;
  'Index Name'?: string;
  'Actual Rows'?: number;
  Plans?: PlanNode[];
}
const indexes = (node: PlanNode): string[] => [
  ...(node['Index Name'] ? [node['Index Name']] : []),
  ...(node.Plans ?? []).flatMap(indexes),
];

async function main() {
  const database = await createSchemaDatabase();
  const { source } = database;
  try {
    await source.runMigrations();
    // Dataset creation is an explicit development benchmark, not an HTTP workload.
    await source.query(`SET statement_timeout = '60s'`);
    const users = 10000,
      listings = 30000,
      conversations = 30000,
      messages = 300000;
    await source.query(
      `INSERT INTO users(id,email_normalized,display_name,status,email_verified_at)
      SELECT md5('msg-user-'||n)::uuid,'msg-'||n||'@example.test','Message user '||n,'ACTIVE',CURRENT_TIMESTAMP
      FROM generate_series(1,$1) n`,
      [users],
    );
    await source.query(
      `INSERT INTO listings(id,seller_id,type,title,price_minor,currency,status,published_at)
      SELECT md5('msg-listing-'||n)::uuid,md5('msg-user-1')::uuid,
      CASE WHEN n%4=0 THEN 'PART' ELSE 'VEHICLE' END,'Message listing '||n,10000+n,'EUR','PUBLISHED',CURRENT_TIMESTAMP
      FROM generate_series(1,$1) n`,
      [listings],
    );
    await source.query(
      `INSERT INTO conversations(id,listing_id,buyer_id,created_at,last_message_at)
      SELECT md5('msg-conversation-'||n)::uuid,md5('msg-listing-'||n)::uuid,
      md5('msg-user-'||(2+(n%9998)))::uuid,'2026-01-01'::timestamptz+n*interval '1 second',
      '2026-02-01'::timestamptz+n*interval '1 second' FROM generate_series(1,$1) n`,
      [conversations],
    );
    await source.query(`INSERT INTO conversation_participants(conversation_id,user_id,joined_at)
      SELECT id,buyer_id,created_at FROM conversations
      UNION ALL SELECT id,md5('msg-user-1')::uuid,created_at FROM conversations`);
    for (let start = 1; start <= messages; start += 25000)
      await source.query(
        `INSERT INTO messages(id,conversation_id,sender_id,client_message_id,body,created_at)
      SELECT md5('msg-message-'||n)::uuid,
      md5('msg-conversation-'||(1+((n-1)%$3)))::uuid,
      CASE WHEN n%2=0 THEN md5('msg-user-1')::uuid
           ELSE md5('msg-user-'||(2+((1+((n-1)%$3))%9998)))::uuid END,
      md5('msg-client-'||n)::uuid,'Plan message '||n,
      '2026-02-01'::timestamptz+n*interval '1 millisecond'
      FROM generate_series($1::integer,$2::integer) n`,
        [start, Math.min(messages, start + 24999), conversations],
      );
    await source.query(`UPDATE conversation_participants participant SET
      (last_read_message_id,last_read_at) = (
        SELECT message.id,message.created_at FROM messages message
        WHERE message.conversation_id=participant.conversation_id
        ORDER BY message.created_at DESC,message.id DESC OFFSET 4 LIMIT 1
      ) WHERE participant.user_id=md5('msg-user-1')::uuid`);
    await source.query('ANALYZE');
    const conversationId = `md5('msg-conversation-10000')::uuid`;
    const userId = `md5('msg-user-5000')::uuid`;
    const sellerId = `md5('msg-user-1')::uuid`;
    const cases = [
      {
        name: 'inbox',
        expected: ['ix_conversation_participants_user_conversation'],
        sql: `SELECT c.id FROM conversation_participants participant JOIN conversations c ON c.id=participant.conversation_id WHERE participant.user_id=${userId} ORDER BY COALESCE(c.last_message_at,c.created_at) DESC,c.id DESC LIMIT 20`,
      },
      {
        name: 'latest messages',
        expected: ['ix_messages_conversation_cursor'],
        sql: `SELECT id FROM messages WHERE conversation_id=${conversationId} ORDER BY created_at DESC,id DESC LIMIT 50`,
      },
      {
        name: 'older history',
        expected: ['ix_messages_conversation_cursor'],
        sql: `SELECT id FROM messages WHERE conversation_id=${conversationId} AND (created_at,id)<('2026-02-03'::timestamptz,md5('cursor')::uuid) ORDER BY created_at DESC,id DESC LIMIT 50`,
      },
      {
        name: 'conversation unread',
        expected: [
          'ix_messages_conversation_cursor',
          'uq_messages_sender_client',
        ],
        sql: `SELECT count(*) FROM messages unread
              JOIN conversation_participants self
                ON self.conversation_id=unread.conversation_id
               AND self.user_id=${sellerId}
              LEFT JOIN messages read_message
                ON read_message.id=self.last_read_message_id
               AND read_message.conversation_id=self.conversation_id
              WHERE unread.conversation_id=${conversationId}
                AND unread.sender_id<>${sellerId}
                AND (self.last_read_message_id IS NULL OR
                     (unread.created_at,unread.id)>(read_message.created_at,read_message.id))`,
      },
      {
        name: 'global unread',
        expected: ['ix_conversation_participants_user_conversation'],
        sql: `SELECT count(*) FROM messages message
              JOIN conversation_participants participant
                ON participant.conversation_id=message.conversation_id
               AND participant.user_id=${userId}
              LEFT JOIN messages read_message
                ON read_message.id=participant.last_read_message_id
               AND read_message.conversation_id=participant.conversation_id
              WHERE message.sender_id<>${userId}
                AND (participant.last_read_message_id IS NULL OR
                     (message.created_at,message.id)>(read_message.created_at,read_message.id))`,
      },
      {
        name: 'conversation dedupe',
        expected: ['uq_conversations_listing_buyer'],
        sql: `SELECT id FROM conversations
              WHERE listing_id=md5('msg-listing-10000')::uuid
                AND buyer_id=md5('msg-user-4')::uuid`,
      },
      {
        name: 'message dedupe',
        expected: ['uq_messages_sender_client'],
        sql: `SELECT id FROM messages WHERE conversation_id=${conversationId} AND sender_id=${sellerId} AND client_message_id=md5('msg-client-10000')::uuid`,
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
        item.expected.some((name) => selected.includes(name)),
        `${item.name}: ${selected.join(', ')}`,
      );
      results.push({
        query: item.name,
        executionMs: document['Execution Time'],
        rows: document.Plan['Actual Rows'],
        indexes: selected,
      });
    }
    process.stdout.write(
      `${JSON.stringify({ dataset: { users, listings, conversations, participants: conversations * 2, messages }, results, note: 'development query-plan review; not a production SLA' }, null, 2)}\n`,
    );
  } finally {
    await database.close();
  }
}
void main();
