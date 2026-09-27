import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Supports the seller dashboard's updated_newest ordering without sorting the seller's history. */
export class ListingSellerUpdatedIndex1789700000000 implements MigrationInterface {
  name = 'ListingSellerUpdatedIndex1789700000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX ix_listings_seller_updated ON listings(seller_id, updated_at, id)',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_listings_seller_updated');
  }
}
