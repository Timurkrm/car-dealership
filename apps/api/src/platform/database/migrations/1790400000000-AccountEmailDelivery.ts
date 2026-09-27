import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountEmailDelivery1790400000000 implements MigrationInterface {
  name = 'AccountEmailDelivery1790400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE auth_action_tokens DROP CONSTRAINT ck_auth_action_tokens_purpose`,
    );
    await queryRunner.query(
      `ALTER TABLE auth_action_tokens ADD CONSTRAINT ck_auth_action_tokens_purpose CHECK (purpose IN ('EMAIL_VERIFICATION','PASSWORD_RESET','EMAIL_CHANGE'))`,
    );
    await queryRunner.query(
      `ALTER TABLE auth_action_tokens ADD COLUMN target_email_normalized varchar(254), ADD COLUMN retained_session_id uuid`,
    );
    await queryRunner.query(`
      CREATE TABLE notification_preferences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        messages_email_enabled boolean NOT NULL DEFAULT true,
        saved_searches_email_enabled boolean NOT NULL DEFAULT false,
        favorites_email_enabled boolean NOT NULL DEFAULT true,
        moderation_email_enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_notification_preferences_user UNIQUE (user_id),
        CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE notification_deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id uuid,
        user_id uuid NOT NULL,
        channel varchar(16) NOT NULL DEFAULT 'EMAIL',
        template varchar(48) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'PENDING',
        mandatory boolean NOT NULL DEFAULT false,
        dedupe_key varchar(160) NOT NULL,
        recipient_email varchar(254),
        payload jsonb NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL,
        locked_at timestamptz,
        sent_at timestamptz,
        provider_message_id varchar(256),
        last_error_code varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_notification_deliveries_notification FOREIGN KEY (notification_id)
          REFERENCES notifications(id) ON DELETE CASCADE,
        CONSTRAINT fk_notification_deliveries_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT ck_notification_deliveries_channel CHECK (channel = 'EMAIL'),
        CONSTRAINT ck_notification_deliveries_status CHECK (status IN ('PENDING','PROCESSING','RETRY','SENT','FAILED','SUPPRESSED')),
        CONSTRAINT ck_notification_deliveries_template CHECK (template IN ('VERIFY_EMAIL','PASSWORD_RESET','EMAIL_CHANGE_CONFIRMATION','EMAIL_CHANGED','NEW_MESSAGE','SAVED_SEARCH_MATCH','FAVORITE_STATUS_CHANGED','MODERATION_RESULT','ACCOUNT_STATUS_CHANGED')),
        CONSTRAINT ck_notification_deliveries_attempts CHECK (attempts >= 0),
        CONSTRAINT ck_notification_deliveries_payload CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384 AND payload->>'schemaVersion' = '1')
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_notification_deliveries_notification_channel ON notification_deliveries(notification_id, channel) WHERE notification_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_notification_deliveries_dedupe ON notification_deliveries(dedupe_key)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notification_deliveries_claim" ON "notification_deliveries"  ("available_at", "created_at", "id") WHERE status IN ('PENDING', 'RETRY')`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_notification_deliveries_lease ON notification_deliveries(locked_at, id) WHERE status = 'PROCESSING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notification_deliveries_user_created" ON "notification_deliveries"  ("user_id", "created_at", "id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE notification_deliveries`);
    await queryRunner.query(`DROP TABLE notification_preferences`);
    await queryRunner.query(
      `ALTER TABLE auth_action_tokens DROP COLUMN retained_session_id, DROP COLUMN target_email_normalized`,
    );
    await queryRunner.query(
      `ALTER TABLE auth_action_tokens DROP CONSTRAINT ck_auth_action_tokens_purpose`,
    );
    await queryRunner.query(
      `ALTER TABLE auth_action_tokens ADD CONSTRAINT ck_auth_action_tokens_purpose CHECK (purpose IN ('EMAIL_VERIFICATION','PASSWORD_RESET'))`,
    );
  }
}
