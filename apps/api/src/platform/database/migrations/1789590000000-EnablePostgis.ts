import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePostgis1789590000000 implements MigrationInterface {
  name = 'EnablePostgis1789590000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS postgis');
  }
  async down(): Promise<void> {
    // The extension may predate this migration or be shared by other schemas.
    // Retain it on rollback; dropping it risks destroying spatial columns.
  }
}
