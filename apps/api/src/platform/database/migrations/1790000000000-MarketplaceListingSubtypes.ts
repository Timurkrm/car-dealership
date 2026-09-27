import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve offer identity/history; discriminator FKs enforce at most one matching subtype. */
export class MarketplaceListingSubtypes1790000000000 implements MigrationInterface {
  name = 'MarketplaceListingSubtypes1790000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of [
      'ALTER TABLE "listings" DROP CONSTRAINT "fk_listings_vehicle"',
      'DROP INDEX "public"."ix_listings_vehicle"',
      'CREATE TABLE "vehicle_listings" ("listing_id" uuid NOT NULL, "type" character varying(16) NOT NULL DEFAULT \'VEHICLE\', "vehicle_id" uuid NOT NULL, CONSTRAINT "ck_vehicle_listings_type" CHECK (type = \'VEHICLE\'), CONSTRAINT "PK_da200c2f190aa1d003b738dfe9f" PRIMARY KEY ("listing_id"))',
      'CREATE INDEX "ix_vehicle_listings_vehicle" ON "vehicle_listings"  ("vehicle_id") ',
      'CREATE TABLE "part_listings" ("listing_id" uuid NOT NULL, "type" character varying(16) NOT NULL DEFAULT \'PART\', "part_id" uuid NOT NULL, "quantity_available" integer NOT NULL DEFAULT \'1\', CONSTRAINT "ck_part_listings_quantity" CHECK (quantity_available BETWEEN 0 AND 1000000), CONSTRAINT "ck_part_listings_type" CHECK (type = \'PART\'), CONSTRAINT "PK_d43bb44c67f281538509f75602a" PRIMARY KEY ("listing_id"))',
      'CREATE UNIQUE INDEX "uq_part_listings_part" ON "part_listings"  ("part_id") ',
      'CREATE TABLE "parts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "category_id" uuid NOT NULL, "brand_id" uuid, "name" character varying(200) NOT NULL, "condition" character varying(16) NOT NULL, "manufacturer_part_number" character varying(100), "oem_number" character varying(100), "fitment_mode" character varying(24) NOT NULL, CONSTRAINT "ck_parts_oem_number" CHECK (oem_number IS NULL OR (oem_number = upper(btrim(oem_number)) AND oem_number ~ \'^[A-Z0-9][A-Z0-9 ._/-]*$\')), CONSTRAINT "ck_parts_manufacturer_number" CHECK (manufacturer_part_number IS NULL OR (manufacturer_part_number = upper(btrim(manufacturer_part_number)) AND manufacturer_part_number ~ \'^[A-Z0-9][A-Z0-9 ._/-]*$\')), CONSTRAINT "ck_parts_fitment_mode" CHECK (fitment_mode IN (\'UNIVERSAL\', \'VEHICLE_SPECIFIC\')), CONSTRAINT "ck_parts_condition" CHECK (condition IN (\'NEW\', \'USED\', \'REFURBISHED\', \'FOR_PARTS\')), CONSTRAINT "ck_parts_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 200), CONSTRAINT "PK_daa5595bb8933f49ac00c9ebc79" PRIMARY KEY ("id"))',
      'CREATE INDEX "ix_parts_oem_number" ON "parts"  ("oem_number") WHERE oem_number IS NOT NULL',
      'CREATE INDEX "ix_parts_manufacturer_number" ON "parts"  ("manufacturer_part_number") WHERE manufacturer_part_number IS NOT NULL',
      'CREATE INDEX "ix_parts_brand" ON "parts"  ("brand_id", "id") WHERE brand_id IS NOT NULL',
      'CREATE INDEX "ix_parts_category" ON "parts"  ("category_id", "id") ',
      'CREATE TABLE "part_categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "parent_id" uuid, "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT \'0\', CONSTRAINT "ck_part_categories_order" CHECK (sort_order >= 0), CONSTRAINT "ck_part_categories_slug" CHECK (slug ~ \'^[a-z0-9]+(-[a-z0-9]+)*$\'), CONSTRAINT "ck_part_categories_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 120), CONSTRAINT "ck_part_categories_parent" CHECK (parent_id IS NULL OR parent_id <> id), CONSTRAINT "PK_6070cc11099e9ef60593846832c" PRIMARY KEY ("id"))',
      'CREATE INDEX "ix_part_categories_parent_order" ON "part_categories"  ("parent_id", "sort_order", "id") ',
      'CREATE UNIQUE INDEX "uq_part_categories_slug" ON "part_categories"  ("slug") ',
      'CREATE TABLE "part_brands" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "ck_part_brands_slug" CHECK (slug ~ \'^[a-z0-9]+(-[a-z0-9]+)*$\'), CONSTRAINT "ck_part_brands_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 120), CONSTRAINT "PK_2c00ade94be5beae1807a9f144d" PRIMARY KEY ("id"))',
      'CREATE UNIQUE INDEX "uq_part_brands_slug" ON "part_brands"  ("slug") ',
      'CREATE TABLE "part_fitments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "part_id" uuid NOT NULL, "model_id" uuid NOT NULL, "generation_id" uuid, "year_from" smallint, "year_to" smallint, CONSTRAINT "ck_part_fitments_years" CHECK ((year_from IS NULL OR year_from BETWEEN 1886 AND 2100) AND (year_to IS NULL OR year_to BETWEEN 1886 AND 2100) AND (year_from IS NULL OR year_to IS NULL OR year_from <= year_to)), CONSTRAINT "PK_fc80d6cb9534c2a2a74cecec400" PRIMARY KEY ("id"))',
      'CREATE INDEX "ix_part_fitments_model_generation" ON "part_fitments"  ("model_id", "generation_id", "part_id") ',
      'ALTER TABLE "listings" ADD "type" character varying(16) NOT NULL DEFAULT \'VEHICLE\'',
      'ALTER TABLE "listings" ADD CONSTRAINT "ck_listings_type" CHECK (type IN (\'VEHICLE\', \'PART\'))',
      'ALTER TABLE "listings" ADD CONSTRAINT "uq_listings_identity_type" UNIQUE ("id", "type")',
      'ALTER TABLE "vehicle_listings" ADD CONSTRAINT "fk_vehicle_listings_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      'ALTER TABLE "vehicle_listings" ADD CONSTRAINT "fk_vehicle_listings_root" FOREIGN KEY ("listing_id", "type") REFERENCES "listings"("id","type") ON DELETE CASCADE ON UPDATE NO ACTION',
      'ALTER TABLE "part_listings" ADD CONSTRAINT "fk_part_listings_part" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      'ALTER TABLE "part_listings" ADD CONSTRAINT "fk_part_listings_root" FOREIGN KEY ("listing_id", "type") REFERENCES "listings"("id","type") ON DELETE CASCADE ON UPDATE NO ACTION',
      'ALTER TABLE "parts" ADD CONSTRAINT "fk_parts_category" FOREIGN KEY ("category_id") REFERENCES "part_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      'ALTER TABLE "parts" ADD CONSTRAINT "fk_parts_brand" FOREIGN KEY ("brand_id") REFERENCES "part_brands"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      'ALTER TABLE "part_categories" ADD CONSTRAINT "fk_part_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "part_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      'ALTER TABLE "part_fitments" ADD CONSTRAINT "fk_part_fitments_part" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
      'ALTER TABLE "part_fitments" ADD CONSTRAINT "fk_part_fitments_model" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      'ALTER TABLE "part_fitments" ADD CONSTRAINT "fk_part_fitments_generation_model" FOREIGN KEY ("generation_id", "model_id") REFERENCES "vehicle_generations"("id","model_id") ON DELETE RESTRICT ON UPDATE NO ACTION',
      'INSERT INTO vehicle_listings(listing_id, vehicle_id) SELECT id, vehicle_id FROM listings',
      'CREATE UNIQUE INDEX uq_part_fitments_selection ON part_fitments (part_id, model_id, generation_id, year_from, year_to) NULLS NOT DISTINCT',
      'ALTER TABLE listings DROP COLUMN vehicle_id',
    ])
      await queryRunner.query(sql);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'LOCK TABLE listings, parts IN ACCESS EXCLUSIVE MODE',
    );
    const rows: { present: boolean }[] = await queryRunner.query(
      "SELECT EXISTS (SELECT 1 FROM listings WHERE type = 'PART') OR EXISTS (SELECT 1 FROM parts) AS present",
    );
    if (rows[0]?.present)
      throw new Error(
        'Rollback blocked: PART data cannot be represented by the vehicle-only schema',
      );
    for (const sql of [
      'ALTER TABLE listings ADD vehicle_id uuid',
      'UPDATE listings SET vehicle_id = vehicle_listings.vehicle_id FROM vehicle_listings WHERE vehicle_listings.listing_id = listings.id',
      'ALTER TABLE listings ALTER COLUMN vehicle_id SET NOT NULL',
      'DROP TABLE part_fitments',
      'DROP TABLE part_listings',
      'DROP TABLE vehicle_listings',
      'DROP TABLE parts',
      'DROP TABLE part_categories',
      'DROP TABLE part_brands',
      'ALTER TABLE listings DROP COLUMN type',
      'ALTER TABLE listings ADD CONSTRAINT fk_listings_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT',
      'CREATE INDEX ix_listings_vehicle ON listings(vehicle_id)',
    ])
      await queryRunner.query(sql);
  }
}
