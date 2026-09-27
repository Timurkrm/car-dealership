import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MessagingRealtime1790300000000 implements MigrationInterface {
  name = 'MessagingRealtime1790300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE conversations ADD buyer_id uuid`);
    await queryRunner.query(
      `ALTER TABLE conversations ADD last_message_at timestamptz`,
    );
    await queryRunner.query(`UPDATE conversations conversation
      SET buyer_id = COALESCE(
        (SELECT participant.user_id FROM conversation_participants participant
         JOIN listings listing ON listing.id = conversation.listing_id
         WHERE participant.conversation_id = conversation.id
           AND participant.user_id <> listing.seller_id
         ORDER BY participant.joined_at, participant.user_id LIMIT 1),
        (SELECT participant.user_id FROM conversation_participants participant
         WHERE participant.conversation_id = conversation.id
         ORDER BY participant.joined_at, participant.user_id LIMIT 1),
        (SELECT listing.seller_id FROM listings listing WHERE listing.id = conversation.listing_id)
      )`);
    await queryRunner.query(
      `ALTER TABLE conversations ALTER COLUMN buyer_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE conversations ADD CONSTRAINT "fk_conversations_buyer" FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_conversations_listing_buyer" ON conversations(listing_id, buyer_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_conversations_activity" ON conversations(last_message_at, id)`,
    );

    await queryRunner.query(`ALTER TABLE messages ADD client_message_id uuid`);
    await queryRunner.query(`UPDATE messages SET client_message_id = id`);
    await queryRunner.query(
      `ALTER TABLE messages ALTER COLUMN client_message_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE messages ADD CONSTRAINT "uq_messages_id_conversation" UNIQUE (id, conversation_id)`,
    );
    await queryRunner.query(
      `ALTER TABLE messages ADD CONSTRAINT "uq_messages_sender_client" UNIQUE (conversation_id, sender_id, client_message_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE conversation_participants ADD last_read_message_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE conversation_participants ADD CONSTRAINT "fk_conversation_participants_read_message" FOREIGN KEY (last_read_message_id, conversation_id) REFERENCES messages(id, conversation_id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_conversation_participants_user_conversation" ON conversation_participants(user_id, conversation_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE outbox_events DROP CONSTRAINT "ck_outbox_events_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE outbox_events ADD CONSTRAINT "ck_outbox_events_type" CHECK (type IN ('LISTING_PUBLISHED', 'LISTING_MARKED_SOLD', 'LISTING_ARCHIVED', 'LISTING_REMOVED_BY_MODERATOR', 'MESSAGE_CREATED'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM notifications WHERE source_event_id IN (SELECT id FROM outbox_events WHERE type = 'MESSAGE_CREATED')`,
    );
    await queryRunner.query(
      `DELETE FROM outbox_events WHERE type = 'MESSAGE_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TABLE outbox_events DROP CONSTRAINT "ck_outbox_events_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE outbox_events ADD CONSTRAINT "ck_outbox_events_type" CHECK (type IN ('LISTING_PUBLISHED', 'LISTING_MARKED_SOLD', 'LISTING_ARCHIVED', 'LISTING_REMOVED_BY_MODERATOR'))`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_conversation_participants_user_conversation"`,
    );
    await queryRunner.query(
      `ALTER TABLE conversation_participants DROP CONSTRAINT "fk_conversation_participants_read_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE conversation_participants DROP COLUMN last_read_message_id`,
    );
    await queryRunner.query(
      `ALTER TABLE messages DROP CONSTRAINT "uq_messages_sender_client"`,
    );
    await queryRunner.query(
      `ALTER TABLE messages DROP CONSTRAINT "uq_messages_id_conversation"`,
    );
    await queryRunner.query(
      `ALTER TABLE messages DROP COLUMN client_message_id`,
    );
    await queryRunner.query(`DROP INDEX "ix_conversations_activity"`);
    await queryRunner.query(`DROP INDEX "uq_conversations_listing_buyer"`);
    await queryRunner.query(
      `ALTER TABLE conversations DROP CONSTRAINT "fk_conversations_buyer"`,
    );
    await queryRunner.query(
      `ALTER TABLE conversations DROP COLUMN last_message_at`,
    );
    await queryRunner.query(`ALTER TABLE conversations DROP COLUMN buyer_id`);
  }
}
