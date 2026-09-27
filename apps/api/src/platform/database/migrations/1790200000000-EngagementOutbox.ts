import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EngagementOutbox1790200000000 implements MigrationInterface {
  name = 'EngagementOutbox1790200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "outbox_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "type" varchar(48) NOT NULL,
      "aggregate_type" varchar(32) NOT NULL,
      "aggregate_id" uuid NOT NULL,
      "payload" jsonb NOT NULL,
      "occurred_at" timestamptz NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'PENDING',
      "attempts" integer NOT NULL DEFAULT 0,
      "available_at" timestamptz NOT NULL,
      "locked_at" timestamptz,
      "processed_at" timestamptz,
      "checkpoint" uuid,
      "last_error_code" varchar(64),
      CONSTRAINT "ck_outbox_events_type" CHECK (type IN ('LISTING_PUBLISHED', 'LISTING_MARKED_SOLD', 'LISTING_ARCHIVED', 'LISTING_REMOVED_BY_MODERATOR')),
      CONSTRAINT "ck_outbox_events_status" CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'PROCESSED', 'FAILED')),
      CONSTRAINT "ck_outbox_events_payload" CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 4096),
      CONSTRAINT "ck_outbox_events_attempts" CHECK (attempts >= 0),
      CONSTRAINT "ck_outbox_events_dates" CHECK ((status <> 'PROCESSING' OR locked_at IS NOT NULL) AND (status <> 'PROCESSED' OR processed_at IS NOT NULL)),
      CONSTRAINT "pk_outbox_events" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "ix_outbox_events_claim" ON outbox_events(available_at, id) WHERE status IN ('PENDING', 'RETRY')`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_outbox_events_processing_lease" ON outbox_events(locked_at, id) WHERE status = 'PROCESSING'`,
    );

    await queryRunner.query(
      `ALTER TABLE favorites ADD listing_type varchar(16)`,
    );
    await queryRunner.query(
      `UPDATE favorites favorite SET listing_type = listing.type FROM listings listing WHERE listing.id = favorite.listing_id`,
    );
    await queryRunner.query(
      `ALTER TABLE favorites ALTER COLUMN listing_type SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE favorites ADD CONSTRAINT "ck_favorites_listing_type" CHECK (listing_type IN ('VEHICLE', 'PART'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_favorites_user_type_created" ON favorites(user_id, listing_type, created_at, listing_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE saved_searches ADD listing_type varchar(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches ADD filter_fingerprint varchar(64)`,
    );
    await queryRunner.query(
      `UPDATE saved_searches
       SET listing_type = 'VEHICLE', notifications_enabled = false,
           filter_fingerprint = md5(id::text) || md5('legacy:' || id::text)`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches ALTER COLUMN listing_type SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches ALTER COLUMN filter_fingerprint SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches ADD CONSTRAINT "ck_saved_searches_listing_type" CHECK (listing_type IN ('VEHICLE', 'PART'))`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches ADD CONSTRAINT "ck_saved_searches_fingerprint" CHECK (filter_fingerprint ~ '^[0-9a-f]{64}$')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_saved_searches_user_fingerprint" ON saved_searches(user_id, listing_type, filter_fingerprint)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_saved_searches_enabled_type" ON saved_searches(listing_type, id) WHERE notifications_enabled = true`,
    );

    await queryRunner.query(
      `UPDATE notifications SET payload = payload || jsonb_build_object('schemaVersion', 1) WHERE NOT payload ? 'schemaVersion'`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "ck_notifications_payload"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "ck_notifications_payload" CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384 AND payload ? 'schemaVersion' AND (payload->>'schemaVersion') ~ '^[1-9][0-9]*$')`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "ck_notifications_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "ck_notifications_type" CHECK (type IN ('NEW_MESSAGE', 'LISTING_STATUS_CHANGED', 'MODERATION_RESULT', 'ACCOUNT_STATUS_CHANGED', 'PRICE_CHANGED', 'SAVED_SEARCH_MATCH', 'FAVORITE_LISTING_STATUS_CHANGED'))`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD source_event_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "fk_notifications_source_event" FOREIGN KEY (source_event_id) REFERENCES outbox_events(id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_notifications_event_recipient_type" ON notifications(user_id, source_event_id, type) WHERE source_event_id IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM notifications WHERE source_event_id IS NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_notifications_event_recipient_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "fk_notifications_source_event"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP COLUMN source_event_id`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "ck_notifications_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "ck_notifications_type" CHECK (type IN ('NEW_MESSAGE', 'LISTING_STATUS_CHANGED', 'MODERATION_RESULT', 'ACCOUNT_STATUS_CHANGED', 'PRICE_CHANGED', 'SAVED_SEARCH_MATCH'))`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "ck_notifications_payload"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "ck_notifications_payload" CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384)`,
    );

    await queryRunner.query(`DROP INDEX "ix_saved_searches_enabled_type"`);
    await queryRunner.query(`DROP INDEX "uq_saved_searches_user_fingerprint"`);
    await queryRunner.query(
      `ALTER TABLE saved_searches DROP CONSTRAINT "ck_saved_searches_fingerprint"`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches DROP CONSTRAINT "ck_saved_searches_listing_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches DROP COLUMN filter_fingerprint`,
    );
    await queryRunner.query(
      `ALTER TABLE saved_searches DROP COLUMN listing_type`,
    );

    await queryRunner.query(`DROP INDEX "ix_favorites_user_type_created"`);
    await queryRunner.query(
      `ALTER TABLE favorites DROP CONSTRAINT "ck_favorites_listing_type"`,
    );
    await queryRunner.query(`ALTER TABLE favorites DROP COLUMN listing_type`);

    await queryRunner.query(`DROP TABLE "outbox_events"`);
  }
}
