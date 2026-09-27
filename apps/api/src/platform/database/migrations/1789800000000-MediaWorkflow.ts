import type { MigrationInterface, QueryRunner } from 'typeorm';
export class MediaWorkflow1789800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE listing_media DROP CONSTRAINT ck_listing_media_status;
      ALTER TABLE listing_media DROP CONSTRAINT uq_listing_media_position;
      ALTER TABLE listing_media ADD COLUMN upload_expires_at timestamptz,
        ADD COLUMN source_size integer, ADD COLUMN detected_format varchar(16),
        ADD COLUMN width integer, ADD COLUMN height integer, ADD COLUMN processed_at timestamptz,
        ADD COLUMN failure_code varchar(40), ADD COLUMN source_etag varchar(128),
        ADD COLUMN processing_token uuid, ADD COLUMN lease_until timestamptz,
        ADD COLUMN dispatch_at timestamptz, ADD COLUMN attempts integer NOT NULL DEFAULT 0;
      UPDATE listing_media SET status = 'FAILED', is_primary = false, failure_code = 'LEGACY_UNVALIDATED';
      ALTER TABLE listing_media ADD CONSTRAINT ck_listing_media_status CHECK (status IN ('PENDING','UPLOADED','PROCESSING','READY','FAILED','DELETED')),
        ADD CONSTRAINT ck_listing_media_primary_ready CHECK (NOT is_primary OR status = 'READY'),
        ADD CONSTRAINT ck_listing_media_dimensions CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0) AND (source_size IS NULL OR source_size > 0));
      CREATE UNIQUE INDEX uq_listing_media_position ON listing_media(listing_id, sort_order) WHERE status <> 'DELETED';
      CREATE INDEX ix_listing_media_work ON listing_media(status, dispatch_at);
      CREATE TABLE listing_media_variants (
        media_id uuid NOT NULL, kind varchar(16) NOT NULL, storage_key varchar(512) NOT NULL,
        width integer NOT NULL, height integer NOT NULL, size integer NOT NULL,
        CONSTRAINT "PK_a763b3061b3622a2b01d3e5c366" PRIMARY KEY (media_id,kind),
        CONSTRAINT fk_media_variant_media FOREIGN KEY (media_id) REFERENCES listing_media(id) ON DELETE CASCADE,
        CONSTRAINT uq_media_variant_key UNIQUE (storage_key),
        CONSTRAINT ck_media_variant_kind CHECK (kind IN ('thumbnail','medium','large')),
        CONSTRAINT ck_media_variant_dimensions CHECK (width > 0 AND height > 0 AND size > 0)
      );`);
  }
  async down(runner: QueryRunner): Promise<void> {
    // Restoring the previous model loses processing metadata; sources stay private.
    await runner.query(`DROP TABLE listing_media_variants;
      DROP INDEX ix_listing_media_work; DROP INDEX uq_listing_media_position;
      ALTER TABLE listing_media DROP CONSTRAINT ck_listing_media_status,
        DROP CONSTRAINT ck_listing_media_primary_ready, DROP CONSTRAINT ck_listing_media_dimensions;
      DELETE FROM listing_media WHERE status = 'DELETED';
      UPDATE listing_media SET status = CASE WHEN status IN ('FAILED','UPLOADED') THEN 'REJECTED' ELSE status END;
      ALTER TABLE listing_media DROP COLUMN upload_expires_at, DROP COLUMN source_size, DROP COLUMN detected_format,
        DROP COLUMN width, DROP COLUMN height, DROP COLUMN processed_at, DROP COLUMN failure_code,
        DROP COLUMN source_etag, DROP COLUMN processing_token, DROP COLUMN lease_until, DROP COLUMN dispatch_at, DROP COLUMN attempts,
        ADD CONSTRAINT uq_listing_media_position UNIQUE (listing_id,sort_order),
        ADD CONSTRAINT ck_listing_media_status CHECK (status IN ('PENDING','PROCESSING','READY','REJECTED'));`);
  }
}
