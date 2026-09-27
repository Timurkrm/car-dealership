import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Authentication1789610000000 implements MigrationInterface {
  name = 'Authentication1789610000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN email_verified_at timestamptz',
    );
    await queryRunner.query(`CREATE TABLE auth_action_tokens (
      id uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
      user_id uuid NOT NULL, purpose varchar(24) NOT NULL, token_hash varchar(64) NOT NULL,
      expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz,
      CONSTRAINT pk_auth_action_tokens PRIMARY KEY (id),
      CONSTRAINT uq_auth_action_tokens_hash UNIQUE (token_hash),
      CONSTRAINT fk_auth_action_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT ck_auth_action_tokens_purpose CHECK (purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')),
      CONSTRAINT ck_auth_action_tokens_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_auth_action_tokens_dates CHECK (expires_at > created_at AND (consumed_at IS NULL OR consumed_at >= created_at) AND (revoked_at IS NULL OR revoked_at >= created_at))
    )`);
    await queryRunner.query(
      'CREATE INDEX ix_auth_action_tokens_expiry ON auth_action_tokens(expires_at)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_auth_action_tokens_user ON auth_action_tokens(user_id, purpose, created_at)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_auth_action_tokens_live ON auth_action_tokens(user_id, purpose) WHERE consumed_at IS NULL AND revoked_at IS NULL',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE auth_action_tokens');
    await queryRunner.query('ALTER TABLE users DROP COLUMN email_verified_at');
  }
}
