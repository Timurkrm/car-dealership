import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  VersionColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type { User } from '../../../users';
import type { ListingStatus, MinorUnits } from '../../domain/listing.types';

@Entity('listings')
@Index('ix_listings_seller_created', ['sellerId', 'createdAt', 'id'])
@Index('ix_listings_seller_updated', ['sellerId', 'updatedAt', 'id'])
@Unique('uq_listings_identity_type', ['id', 'type'])
@Check('ck_listings_type', "type IN ('VEHICLE', 'PART')")
@Index('ix_listings_published_newest', ['publishedAt', 'id'], {
  where: "status = 'PUBLISHED'",
})
@Index('ix_listings_published_price', ['currency', 'priceMinor', 'id'], {
  where: "status = 'PUBLISHED'",
})
@Index('ix_listings_moderation_queue', ['submittedAt', 'id'], {
  where: "status = 'PENDING_MODERATION'",
})
@Check(
  'ck_listings_status',
  "status IN ('DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'REJECTED', 'SOLD', 'ARCHIVED')",
)
@Check('ck_listings_price', 'price_minor >= 0')
@Check('ck_listings_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_listings_title', 'char_length(btrim(title)) BETWEEN 1 AND 200')
@Check(
  'ck_listings_description',
  'description IS NULL OR char_length(description) <= 20000',
)
@Check('ck_listings_version', 'version > 0')
@Check(
  'ck_listings_lifecycle',
  "(status <> 'PENDING_MODERATION' OR submitted_at IS NOT NULL) AND (status <> 'PUBLISHED' OR published_at IS NOT NULL) AND (status <> 'SOLD' OR (sold_at IS NOT NULL AND published_at IS NOT NULL)) AND (status <> 'ARCHIVED' OR archived_at IS NOT NULL) AND (sold_at IS NULL OR (published_at IS NOT NULL AND sold_at >= published_at))",
)
export class Listing extends MutableRecord {
  @Column({ name: 'seller_id', type: 'uuid' })
  sellerId!: string;

  @ManyToOne('User', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'seller_id',
    foreignKeyConstraintName: 'fk_listings_seller',
  })
  seller!: Relation<User>;

  @Column({ type: 'varchar', length: 16, default: 'VEHICLE' })
  type!: 'VEHICLE' | 'PART';

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'price_minor', type: 'bigint' })
  priceMinor!: MinorUnits;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 24, default: 'DRAFT' })
  status!: ListingStatus;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'sold_at', type: 'timestamptz', nullable: true })
  soldAt!: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @VersionColumn({ type: 'integer', default: 1 })
  version!: number;
}
