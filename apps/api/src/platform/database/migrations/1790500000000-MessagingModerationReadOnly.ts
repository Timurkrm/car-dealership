import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MessagingModerationReadOnly1790500000000 implements MigrationInterface {
  name = 'MessagingModerationReadOnly1790500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE conversations ADD COLUMN send_disabled_at timestamptz`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE conversations DROP COLUMN send_disabled_at`,
    );
  }
}
