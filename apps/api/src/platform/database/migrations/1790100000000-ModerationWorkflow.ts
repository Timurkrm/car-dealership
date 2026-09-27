import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ModerationWorkflow1790100000000 implements MigrationInterface {
  name = 'ModerationWorkflow1790100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "ck_notifications_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "ck_notifications_type" CHECK (type IN ('NEW_MESSAGE', 'LISTING_STATUS_CHANGED', 'MODERATION_RESULT', 'ACCOUNT_STATUS_CHANGED', 'PRICE_CHANGED', 'SAVED_SEARCH_MATCH'))`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT "ck_reports_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT "ck_reports_resolution"`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ALTER COLUMN reason DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD reason_code varchar(40) NOT NULL DEFAULT 'OTHER'`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ALTER COLUMN reason_code DROP DEFAULT`,
    );
    await queryRunner.query(`ALTER TABLE reports ADD resolved_by uuid`);
    await queryRunner.query(`ALTER TABLE reports ADD resolution varchar(40)`);
    await queryRunner.query(`ALTER TABLE reports ADD resolution_note text`);
    await queryRunner.query(
      `UPDATE reports SET resolution = 'OTHER', resolution_note = 'Migrated legacy resolution' WHERE status IN ('RESOLVED', 'DISMISSED')`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD CONSTRAINT "fk_reports_resolved_by" FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD CONSTRAINT "ck_reports_reason_code" CHECK (reason_code IN ('SCAM', 'SPAM', 'PROHIBITED_CONTENT', 'MISLEADING_INFORMATION', 'HARASSMENT', 'DUPLICATE', 'WRONG_CATEGORY', 'OTHER'))`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD CONSTRAINT "ck_reports_details" CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 2000)`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD CONSTRAINT "ck_reports_resolution" CHECK ((status IN ('RESOLVED', 'DISMISSED')) = (resolved_at IS NOT NULL AND resolution IS NOT NULL) AND (resolved_at IS NULL OR resolved_at >= created_at) AND (resolution IS NULL OR resolution IN ('NO_ACTION', 'CONTENT_REMOVED', 'WARNING', 'OTHER')) AND (resolution_note IS NULL OR char_length(btrim(resolution_note)) BETWEEN 1 AND 2000))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reports_status_queue" ON reports(status, created_at, id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reports_active_listing" ON reports(reporter_id, listing_id) WHERE listing_id IS NOT NULL AND status IN ('OPEN', 'IN_REVIEW')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reports_active_user" ON reports(reporter_id, target_user_id) WHERE target_user_id IS NOT NULL AND status IN ('OPEN', 'IN_REVIEW')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reports_active_message" ON reports(reporter_id, message_id) WHERE message_id IS NOT NULL AND status IN ('OPEN', 'IN_REVIEW')`,
    );

    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP CONSTRAINT "ck_moderation_actions_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP CONSTRAINT "ck_moderation_actions_action"`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions RENAME COLUMN reason TO internal_note`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ALTER COLUMN internal_note DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD reason_code varchar(64) NOT NULL DEFAULT 'OTHER'`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ALTER COLUMN reason_code DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD seller_message text`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD CONSTRAINT "ck_moderation_actions_reason_code" CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD CONSTRAINT "ck_moderation_actions_seller_message" CHECK (seller_message IS NULL OR char_length(btrim(seller_message)) BETWEEN 1 AND 2000)`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD CONSTRAINT "ck_moderation_actions_internal_note" CHECK (internal_note IS NULL OR char_length(btrim(internal_note)) BETWEEN 1 AND 2000)`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD CONSTRAINT "ck_moderation_actions_action" CHECK ((target_type = 'LISTING' AND action IN ('APPROVE_LISTING', 'REJECT_LISTING', 'ARCHIVE_LISTING', 'REMOVE_LISTING')) OR (target_type = 'USER' AND action IN ('SUSPEND_USER', 'BLOCK_USER', 'RESTORE_USER')) OR (target_type = 'MESSAGE' AND action = 'REDACT_MESSAGE'))`,
    );

    await queryRunner.query(
      `CREATE INDEX "ix_users_admin_status_created" ON users(status, created_at, id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_user_roles_role_user" ON user_roles(role, user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_logs_action_created" ON audit_logs(action, created_at, id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM notifications WHERE type = 'ACCOUNT_STATUS_CHANGED'`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "ck_notifications_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "ck_notifications_type" CHECK (type IN ('NEW_MESSAGE', 'LISTING_STATUS_CHANGED', 'MODERATION_RESULT', 'PRICE_CHANGED', 'SAVED_SEARCH_MATCH'))`,
    );
    await queryRunner.query(`DROP INDEX "ix_audit_logs_action_created"`);
    await queryRunner.query(`DROP INDEX "ix_user_roles_role_user"`);
    await queryRunner.query(`DROP INDEX "ix_users_admin_status_created"`);
    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP CONSTRAINT "ck_moderation_actions_action"`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP CONSTRAINT "ck_moderation_actions_internal_note"`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP CONSTRAINT "ck_moderation_actions_seller_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP CONSTRAINT "ck_moderation_actions_reason_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP COLUMN seller_message`,
    );
    await queryRunner.query(
      `UPDATE moderation_actions SET action = 'ARCHIVE_LISTING' WHERE action = 'REMOVE_LISTING'`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions DROP COLUMN reason_code`,
    );
    await queryRunner.query(
      `UPDATE moderation_actions SET internal_note = 'Legacy moderation action' WHERE internal_note IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ALTER COLUMN internal_note SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions RENAME COLUMN internal_note TO reason`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD CONSTRAINT "ck_moderation_actions_reason" CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000)`,
    );
    await queryRunner.query(
      `ALTER TABLE moderation_actions ADD CONSTRAINT "ck_moderation_actions_action" CHECK ((target_type = 'LISTING' AND action IN ('APPROVE_LISTING', 'REJECT_LISTING', 'ARCHIVE_LISTING')) OR (target_type = 'USER' AND action IN ('SUSPEND_USER', 'BLOCK_USER', 'RESTORE_USER')) OR (target_type = 'MESSAGE' AND action = 'REDACT_MESSAGE'))`,
    );
    await queryRunner.query(`DROP INDEX "uq_reports_active_message"`);
    await queryRunner.query(`DROP INDEX "uq_reports_active_user"`);
    await queryRunner.query(`DROP INDEX "uq_reports_active_listing"`);
    await queryRunner.query(`DROP INDEX "ix_reports_status_queue"`);
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT "ck_reports_resolution"`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT "ck_reports_details"`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT "ck_reports_reason_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE reports DROP CONSTRAINT "fk_reports_resolved_by"`,
    );
    await queryRunner.query(`ALTER TABLE reports DROP COLUMN resolution_note`);
    await queryRunner.query(`ALTER TABLE reports DROP COLUMN resolution`);
    await queryRunner.query(`ALTER TABLE reports DROP COLUMN resolved_by`);
    await queryRunner.query(`ALTER TABLE reports DROP COLUMN reason_code`);
    await queryRunner.query(
      `UPDATE reports SET reason = 'Legacy report' WHERE reason IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ALTER COLUMN reason SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD CONSTRAINT "ck_reports_reason" CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000)`,
    );
    await queryRunner.query(
      `ALTER TABLE reports ADD CONSTRAINT "ck_reports_resolution" CHECK ((status IN ('RESOLVED', 'DISMISSED')) = (resolved_at IS NOT NULL) AND (resolved_at IS NULL OR resolved_at >= created_at))`,
    );
  }
}
