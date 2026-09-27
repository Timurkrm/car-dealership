import { Check, Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type { MediaStatus, MediaType } from '../../domain/media.types';

@Entity('listing_media')
@Index('uq_listing_media_position', ['listingId', 'sortOrder'], {
  unique: true,
  where: "status <> 'DELETED'",
})
@Unique('uq_listing_media_storage_key', ['storageKey'])
@Index('uq_listing_media_primary', ['listingId'], {
  unique: true,
  where: 'is_primary = true',
})
@Check('ck_listing_media_order', 'sort_order >= 0')
@Check('ck_listing_media_type', "media_type IN ('IMAGE')")
@Check(
  'ck_listing_media_status',
  "status IN ('PENDING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'DELETED')",
)
@Index('ix_listing_media_work', ['status', 'dispatchAt'])
@Check('ck_listing_media_primary_ready', "NOT is_primary OR status = 'READY'")
@Check(
  'ck_listing_media_dimensions',
  '(width IS NULL OR width > 0) AND (height IS NULL OR height > 0) AND (source_size IS NULL OR source_size > 0)',
)
@Check(
  'ck_listing_media_key',
  "char_length(storage_key) BETWEEN 1 AND 512 AND storage_key !~ '(^/|(^|/)\\.\\.?(/|$)|[[:space:]]|://)'",
)
export class ListingMedia extends MutableRecord {
  @Column({ name: 'listing_id', type: 'uuid' })
  @ForeignKey('Listing', {
    name: 'fk_listing_media_listing',
    onDelete: 'RESTRICT',
  })
  listingId!: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 512, select: false })
  storageKey!: string;

  @Column({ name: 'media_type', type: 'varchar', length: 16, default: 'IMAGE' })
  mediaType!: MediaType;

  @Column({ name: 'sort_order', type: 'integer' })
  sortOrder!: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: MediaStatus;

  @Column({ name: 'upload_expires_at', type: 'timestamptz', nullable: true })
  uploadExpiresAt!: Date | null;
  @Column({ name: 'source_size', type: 'integer', nullable: true })
  sourceSize!: number | null;
  @Column({
    name: 'detected_format',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  detectedFormat!: string | null;
  @Column({ type: 'integer', nullable: true }) width!: number | null;
  @Column({ type: 'integer', nullable: true }) height!: number | null;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
  @Column({ name: 'failure_code', type: 'varchar', length: 40, nullable: true })
  failureCode!: string | null;
  @Column({
    name: 'source_etag',
    type: 'varchar',
    length: 128,
    nullable: true,
    select: false,
  })
  sourceEtag!: string | null;
  @Column({
    name: 'processing_token',
    type: 'uuid',
    nullable: true,
    select: false,
  })
  processingToken!: string | null;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil!: Date | null;
  @Column({ name: 'dispatch_at', type: 'timestamptz', nullable: true })
  dispatchAt!: Date | null;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
}
