import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Viewport marker queries must index the independently supplied public geometry. */
export class PublicLocationSearchIndex1789900000000 implements MigrationInterface {
  name = 'PublicLocationSearchIndex1789900000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX ix_listing_locations_public_point ON listing_locations USING gist (public_point) WHERE public_point IS NOT NULL',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_listing_locations_public_point');
  }
}
