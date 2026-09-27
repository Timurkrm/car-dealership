import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Initial marketplace schema. Reviewed SQL; no runtime schema synchronization. */
export class MarketplaceSchema1789600000000 implements MigrationInterface {
  name = 'MarketplaceSchema1789600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Tables and local constraints first, then relational constraints and spatial expression index.
    await queryRunner.query(`CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "email_normalized" character varying(254) NOT NULL,
        "display_name" character varying(100) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
        CONSTRAINT "uq_users_email_normalized" UNIQUE ("email_normalized"),
        CONSTRAINT "ck_users_status" CHECK (status IN ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'PENDING_VERIFICATION')),
        CONSTRAINT "ck_users_display_name" CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 100),
        CONSTRAINT "ck_users_email_normalized" CHECK (email_normalized = lower(btrim(email_normalized)) AND email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role" character varying(16) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "ck_user_roles_role" CHECK (role IN ('USER', 'MODERATOR', 'ADMIN')),
        CONSTRAINT "PK_09d115a69b6014d324d592f9c42" PRIMARY KEY ("user_id", "role")
      )`);
    await queryRunner.query(`CREATE TABLE "user_credentials" (
        "user_id" uuid NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "ck_user_credentials_hash" CHECK (char_length(password_hash) BETWEEN 20 AND 255),
        CONSTRAINT "PK_dd0918407944553611bb3eb3ddc" PRIMARY KEY ("user_id")
      )`);
    await queryRunner.query(`CREATE TABLE "user_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "ck_user_sessions_dates" CHECK (expires_at > created_at AND (revoked_at IS NULL OR revoked_at >= created_at) AND (last_used_at IS NULL OR last_used_at >= created_at)),
        CONSTRAINT "PK_e93e031a5fed190d4789b6bfd83" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_user_sessions_expiry" ON "user_sessions"  ("expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_user_sessions_user_created" ON "user_sessions"  ("user_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "session_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "session_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "uq_session_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "ck_session_tokens_dates" CHECK (expires_at > created_at AND (consumed_at IS NULL OR consumed_at >= created_at) AND (revoked_at IS NULL OR revoked_at >= created_at)),
        CONSTRAINT "ck_session_tokens_hash" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "PK_e1ed1e084316ea54dc239428e49" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_session_tokens_live" ON "session_tokens"  ("session_id") WHERE consumed_at IS NULL AND revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_session_tokens_session" ON "session_tokens"  ("session_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "vehicle_makes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        CONSTRAINT "uq_vehicle_makes_slug" UNIQUE ("slug"),
        CONSTRAINT "ck_vehicle_makes_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
        CONSTRAINT "ck_vehicle_makes_slug" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT "PK_407794f6d12fb1f8f7c4ba1d52b" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE TABLE "vehicle_models" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "make_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        CONSTRAINT "uq_vehicle_models_make_slug" UNIQUE ("make_id", "slug"),
        CONSTRAINT "ck_vehicle_models_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
        CONSTRAINT "ck_vehicle_models_slug" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT "PK_1c01752184334fdbcae9bbaa67f" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE TABLE "vehicle_generations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "model_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "start_year" smallint NOT NULL,
        "end_year" smallint,
        CONSTRAINT "uq_vehicle_generations_id_model" UNIQUE ("id", "model_id"),
        CONSTRAINT "uq_vehicle_generations_model_name" UNIQUE ("model_id", "name"),
        CONSTRAINT "ck_vehicle_generations_years" CHECK (start_year BETWEEN 1886 AND 2100 AND (end_year IS NULL OR end_year BETWEEN start_year AND 2100)),
        CONSTRAINT "ck_vehicle_generations_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
        CONSTRAINT "PK_9724344ad6a0a3b70a43cdd041d" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE TABLE "vehicles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "model_id" uuid NOT NULL,
        "generation_id" uuid,
        "year" smallint NOT NULL,
        "mileage_km" integer NOT NULL,
        "body_type" character varying(16) NOT NULL,
        "fuel_type" character varying(24) NOT NULL,
        "transmission" character varying(16) NOT NULL,
        "drive_type" character varying(8) NOT NULL,
        "engine_power_hp" integer,
        "engine_displacement_cc" integer,
        "color" character varying(16),
        "vin" character varying(17),
        "condition" character varying(16) NOT NULL,
        CONSTRAINT "ck_vehicles_color" CHECK (color IS NULL OR color IN ('BLACK', 'WHITE', 'GRAY', 'SILVER', 'BLUE', 'RED', 'GREEN', 'BROWN', 'BEIGE', 'YELLOW', 'ORANGE', 'PURPLE', 'OTHER')),
        CONSTRAINT "ck_vehicles_condition" CHECK (condition IN ('NEW', 'USED', 'DAMAGED')),
        CONSTRAINT "ck_vehicles_drive" CHECK (drive_type IN ('FWD', 'RWD', 'AWD', 'OTHER')),
        CONSTRAINT "ck_vehicles_transmission" CHECK (transmission IN ('MANUAL', 'AUTOMATIC', 'OTHER')),
        CONSTRAINT "ck_vehicles_fuel" CHECK (fuel_type IN ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'PLUG_IN_HYBRID', 'LPG', 'HYDROGEN', 'OTHER')),
        CONSTRAINT "ck_vehicles_body" CHECK (body_type IN ('SEDAN', 'HATCHBACK', 'SUV', 'COUPE', 'WAGON', 'CONVERTIBLE', 'VAN', 'PICKUP', 'OTHER')),
        CONSTRAINT "ck_vehicles_vin" CHECK (vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
        CONSTRAINT "ck_vehicles_engine" CHECK ((engine_power_hp IS NULL OR engine_power_hp > 0) AND (engine_displacement_cc IS NULL OR engine_displacement_cc > 0)),
        CONSTRAINT "ck_vehicles_mileage" CHECK (mileage_km >= 0),
        CONSTRAINT "ck_vehicles_year" CHECK (year BETWEEN 1886 AND 2100),
        CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_vehicles_body_fuel" ON "vehicles"  ("body_type", "fuel_type", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_vehicles_generation_model" ON "vehicles"  ("generation_id", "model_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_vehicles_model_year" ON "vehicles"  ("model_id", "year", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "listings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "seller_id" uuid NOT NULL,
        "vehicle_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "price_minor" bigint NOT NULL,
        "currency" character varying(3) NOT NULL,
        "status" character varying(24) NOT NULL DEFAULT 'DRAFT',
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "sold_at" TIMESTAMP WITH TIME ZONE,
        "archived_at" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT '1',
        CONSTRAINT "ck_listings_lifecycle" CHECK ((status <> 'PENDING_MODERATION' OR submitted_at IS NOT NULL) AND (status <> 'PUBLISHED' OR published_at IS NOT NULL) AND (status <> 'SOLD' OR (sold_at IS NOT NULL AND published_at IS NOT NULL)) AND (status <> 'ARCHIVED' OR archived_at IS NOT NULL) AND (sold_at IS NULL OR (published_at IS NOT NULL AND sold_at >= published_at))),
        CONSTRAINT "ck_listings_version" CHECK (version > 0),
        CONSTRAINT "ck_listings_description" CHECK (description IS NULL OR char_length(description) <= 20000),
        CONSTRAINT "ck_listings_title" CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
        CONSTRAINT "ck_listings_currency" CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_listings_price" CHECK (price_minor >= 0),
        CONSTRAINT "ck_listings_status" CHECK (status IN ('DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'SOLD', 'ARCHIVED')),
        CONSTRAINT "PK_520ecac6c99ec90bcf5a603cdcb" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_listings_moderation_queue" ON "listings"  ("submitted_at", "id") WHERE status = 'PENDING_MODERATION'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_published_price" ON "listings"  ("currency", "price_minor", "id") WHERE status = 'PUBLISHED'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_published_newest" ON "listings"  ("published_at", "id") WHERE status = 'PUBLISHED'`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_vehicle" ON "listings"  ("vehicle_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_listings_seller_created" ON "listings"  ("seller_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "listing_locations" (
        "listing_id" uuid NOT NULL,
        "point" geometry(Point,4326) NOT NULL,
        "public_point" geometry(Point,4326),
        "city" character varying(120) NOT NULL,
        "region" character varying(120),
        "country_code" character varying(2) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "ck_listing_locations_city" CHECK (char_length(btrim(city)) BETWEEN 1 AND 120),
        CONSTRAINT "ck_listing_locations_country" CHECK (country_code ~ '^[A-Z]{2}$'),
        CONSTRAINT "ck_listing_locations_public_point" CHECK (public_point IS NULL OR (NOT ST_IsEmpty(public_point) AND ST_X(public_point) BETWEEN -180 AND 180 AND ST_Y(public_point) BETWEEN -90 AND 90)),
        CONSTRAINT "ck_listing_locations_point" CHECK (NOT ST_IsEmpty(point) AND ST_X(point) BETWEEN -180 AND 180 AND ST_Y(point) BETWEEN -90 AND 90),
        CONSTRAINT "PK_f7d83e233697d0f58c19abdee8e" PRIMARY KEY ("listing_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_listing_locations_point" ON "listing_locations" USING gist ("point")`,
    );
    await queryRunner.query(`CREATE TABLE "listing_media" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "listing_id" uuid NOT NULL,
        "storage_key" character varying(512) NOT NULL,
        "media_type" character varying(16) NOT NULL DEFAULT 'IMAGE',
        "sort_order" integer NOT NULL,
        "is_primary" boolean NOT NULL DEFAULT false,
        "status" character varying(16) NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "uq_listing_media_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "uq_listing_media_position" UNIQUE ("listing_id", "sort_order"),
        CONSTRAINT "ck_listing_media_key" CHECK (char_length(storage_key) BETWEEN 1 AND 512 AND storage_key !~ '(^/|(^|/)\\.\\.?(/|$)|[[:space:]]|://)'),
        CONSTRAINT "ck_listing_media_status" CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'REJECTED')),
        CONSTRAINT "ck_listing_media_type" CHECK (media_type IN ('IMAGE')),
        CONSTRAINT "ck_listing_media_order" CHECK (sort_order >= 0),
        CONSTRAINT "PK_95a44b7c28e30592adad8b85e51" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_listing_media_primary" ON "listing_media"  ("listing_id") WHERE is_primary = true`,
    );
    await queryRunner.query(`CREATE TABLE "favorites" (
        "user_id" uuid NOT NULL,
        "listing_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_0f8db9b83a100398d2611a8c9d0" PRIMARY KEY ("user_id", "listing_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_favorites_listing" ON "favorites"  ("listing_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_favorites_user_created" ON "favorites"  ("user_id", "created_at", "listing_id")`,
    );
    await queryRunner.query(`CREATE TABLE "saved_searches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "filters" jsonb NOT NULL,
        "schema_version" integer NOT NULL DEFAULT '1',
        "notifications_enabled" boolean NOT NULL DEFAULT false,
        CONSTRAINT "ck_saved_searches_version" CHECK (schema_version > 0),
        CONSTRAINT "ck_saved_searches_filters" CHECK (jsonb_typeof(filters) = 'object' AND octet_length(filters::text) <= 16384),
        CONSTRAINT "ck_saved_searches_name" CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
        CONSTRAINT "PK_d9a53c71ccc5cf66dcdc5b33dfe" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_saved_searches_user_created" ON "saved_searches"  ("user_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "conversations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "listing_id" uuid NOT NULL,
        CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_conversations_listing_created" ON "conversations"  ("listing_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "conversation_participants" (
        "conversation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_read_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "ck_conversation_participants_read" CHECK (last_read_at IS NULL OR last_read_at >= joined_at),
        CONSTRAINT "PK_fdcd6405d74e797f10fa8360338" PRIMARY KEY ("conversation_id", "user_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_conversation_participants_user" ON "conversation_participants"  ("user_id", "joined_at", "conversation_id")`,
    );
    await queryRunner.query(`CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "conversation_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "body" text NOT NULL,
        "edited_at" TIMESTAMP WITH TIME ZONE,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "ck_messages_dates" CHECK ((edited_at IS NULL OR edited_at >= created_at) AND (deleted_at IS NULL OR deleted_at >= created_at)),
        CONSTRAINT "ck_messages_body" CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
        CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_messages_sender" ON "messages"  ("sender_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_messages_conversation_cursor" ON "messages"  ("conversation_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" uuid NOT NULL,
        "type" character varying(32) NOT NULL,
        "payload" jsonb NOT NULL,
        "read_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "ck_notifications_read" CHECK (read_at IS NULL OR read_at >= created_at),
        CONSTRAINT "ck_notifications_payload" CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
        CONSTRAINT "ck_notifications_type" CHECK (type IN ('NEW_MESSAGE', 'LISTING_STATUS_CHANGED', 'MODERATION_RESULT', 'PRICE_CHANGED', 'SAVED_SEARCH_MATCH')),
        CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_notifications_user_unread" ON "notifications"  ("user_id", "created_at", "id") WHERE read_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notifications_user_created" ON "notifications"  ("user_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "reporter_id" uuid NOT NULL,
        "target_type" character varying(16) NOT NULL,
        "listing_id" uuid,
        "target_user_id" uuid,
        "message_id" uuid,
        "reason" text NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'OPEN',
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "ck_reports_resolution" CHECK ((status IN ('RESOLVED', 'DISMISSED')) = (resolved_at IS NOT NULL) AND (resolved_at IS NULL OR resolved_at >= created_at)),
        CONSTRAINT "ck_reports_reason" CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
        CONSTRAINT "ck_reports_status" CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
        CONSTRAINT "ck_reports_target" CHECK ((target_type = 'LISTING' AND listing_id IS NOT NULL AND target_user_id IS NULL AND message_id IS NULL) OR (target_type = 'USER' AND target_user_id IS NOT NULL AND listing_id IS NULL AND message_id IS NULL) OR (target_type = 'MESSAGE' AND message_id IS NOT NULL AND listing_id IS NULL AND target_user_id IS NULL)),
        CONSTRAINT "PK_d9013193989303580053c0b5ef6" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_reports_message" ON "reports"  ("message_id") WHERE message_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reports_user" ON "reports"  ("target_user_id") WHERE target_user_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reports_listing" ON "reports"  ("listing_id") WHERE listing_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reports_reporter" ON "reports"  ("reporter_id", "created_at", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_reports_queue" ON "reports"  ("created_at", "id") WHERE status IN ('OPEN', 'IN_REVIEW')`,
    );
    await queryRunner.query(`CREATE TABLE "moderation_actions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "moderator_id" uuid NOT NULL,
        "target_type" character varying(16) NOT NULL,
        "listing_id" uuid,
        "target_user_id" uuid,
        "message_id" uuid,
        "action" character varying(32) NOT NULL,
        "reason" text NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "ck_moderation_actions_metadata" CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
        CONSTRAINT "ck_moderation_actions_reason" CHECK (char_length(btrim(reason)) BETWEEN 1 AND 2000),
        CONSTRAINT "ck_moderation_actions_action" CHECK ((target_type = 'LISTING' AND action IN ('APPROVE_LISTING', 'REJECT_LISTING', 'ARCHIVE_LISTING')) OR (target_type = 'USER' AND action IN ('SUSPEND_USER', 'BLOCK_USER', 'RESTORE_USER')) OR (target_type = 'MESSAGE' AND action = 'REDACT_MESSAGE')),
        CONSTRAINT "ck_moderation_actions_target" CHECK ((target_type = 'LISTING' AND listing_id IS NOT NULL AND target_user_id IS NULL AND message_id IS NULL) OR (target_type = 'USER' AND target_user_id IS NOT NULL AND listing_id IS NULL AND message_id IS NULL) OR (target_type = 'MESSAGE' AND message_id IS NOT NULL AND listing_id IS NULL AND target_user_id IS NULL)),
        CONSTRAINT "PK_d259906fb4d2a5ef718f1f66e35" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_moderation_actions_message" ON "moderation_actions"  ("message_id", "created_at", "id") WHERE message_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_moderation_actions_user" ON "moderation_actions"  ("target_user_id", "created_at", "id") WHERE target_user_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_moderation_actions_listing" ON "moderation_actions"  ("listing_id", "created_at", "id") WHERE listing_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_moderation_actions_moderator" ON "moderation_actions"  ("moderator_id", "created_at", "id")`,
    );
    await queryRunner.query(`CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actor_user_id" uuid,
        "action" character varying(64) NOT NULL,
        "target_type" character varying(32) NOT NULL,
        "target_id" uuid NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "request_id" character varying(128),
        CONSTRAINT "ck_audit_logs_metadata" CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
        CONSTRAINT "ck_audit_logs_request_id" CHECK (request_id IS NULL OR char_length(btrim(request_id)) BETWEEN 1 AND 128),
        CONSTRAINT "ck_audit_logs_target_type" CHECK (target_type ~ '^[A-Z][A-Z0-9_]{0,31}$'),
        CONSTRAINT "ck_audit_logs_action" CHECK (action ~ '^[A-Z][A-Z0-9_]{0,63}$'),
        CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_audit_logs_created" ON "audit_logs"  ("created_at", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_logs_target_created" ON "audit_logs"  ("target_type", "target_id", "created_at", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_logs_actor_created" ON "audit_logs"  ("actor_user_id", "created_at", "id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_credentials" ADD CONSTRAINT "fk_user_credentials_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_sessions" ADD CONSTRAINT "fk_user_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "session_tokens" ADD CONSTRAINT "fk_session_tokens_session" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_models" ADD CONSTRAINT "fk_vehicle_models_make" FOREIGN KEY ("make_id") REFERENCES "vehicle_makes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_generations" ADD CONSTRAINT "fk_vehicle_generations_model" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "fk_vehicles_model" FOREIGN KEY ("model_id") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "fk_vehicles_generation_model" FOREIGN KEY ("generation_id", "model_id") REFERENCES "vehicle_generations"("id","model_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "fk_listings_seller" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD CONSTRAINT "fk_listings_vehicle" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_locations" ADD CONSTRAINT "fk_listing_locations_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_media" ADD CONSTRAINT "fk_listing_media_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorites" ADD CONSTRAINT "fk_favorites_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorites" ADD CONSTRAINT "fk_favorites_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_searches" ADD CONSTRAINT "fk_saved_searches_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "fk_conversations_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_participants" ADD CONSTRAINT "fk_conversation_participants_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation_participants" ADD CONSTRAINT "fk_conversation_participants_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_sender_participant" FOREIGN KEY ("conversation_id", "sender_id") REFERENCES "conversation_participants"("conversation_id","user_id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_user" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_message" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "moderation_actions" ADD CONSTRAINT "fk_moderation_actions_moderator" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "moderation_actions" ADD CONSTRAINT "fk_moderation_actions_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "moderation_actions" ADD CONSTRAINT "fk_moderation_actions_user" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "moderation_actions" ADD CONSTRAINT "fk_moderation_actions_message" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "fk_audit_logs_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX ix_listing_locations_geography ON listing_locations USING gist ((point::geography))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Child-to-parent order, without CASCADE. PostGIS and migration history are retained.
    await queryRunner.query('DROP TABLE audit_logs');
    await queryRunner.query('DROP TABLE moderation_actions');
    await queryRunner.query('DROP TABLE reports');
    await queryRunner.query('DROP TABLE notifications');
    await queryRunner.query('DROP TABLE messages');
    await queryRunner.query('DROP TABLE conversation_participants');
    await queryRunner.query('DROP TABLE conversations');
    await queryRunner.query('DROP TABLE saved_searches');
    await queryRunner.query('DROP TABLE favorites');
    await queryRunner.query('DROP TABLE listing_media');
    await queryRunner.query('DROP TABLE listing_locations');
    await queryRunner.query('DROP TABLE listings');
    await queryRunner.query('DROP TABLE vehicles');
    await queryRunner.query('DROP TABLE vehicle_generations');
    await queryRunner.query('DROP TABLE vehicle_models');
    await queryRunner.query('DROP TABLE vehicle_makes');
    await queryRunner.query('DROP TABLE session_tokens');
    await queryRunner.query('DROP TABLE user_sessions');
    await queryRunner.query('DROP TABLE user_credentials');
    await queryRunner.query('DROP TABLE user_roles');
    await queryRunner.query('DROP TABLE users');
  }
}
