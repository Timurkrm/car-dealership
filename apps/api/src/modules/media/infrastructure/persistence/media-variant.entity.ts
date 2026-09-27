import {
  Entity,
  Column,
  PrimaryColumn,
  ForeignKey,
  Unique,
  Check,
} from 'typeorm';
@Entity('listing_media_variants')
@Unique('uq_media_variant_key', ['storageKey'])
@Check('ck_media_variant_kind', "kind IN ('thumbnail', 'medium', 'large')")
@Check('ck_media_variant_dimensions', 'width > 0 AND height > 0 AND size > 0')
export class MediaVariant {
  @PrimaryColumn({ name: 'media_id', type: 'uuid' })
  @ForeignKey('ListingMedia', {
    name: 'fk_media_variant_media',
    onDelete: 'CASCADE',
  })
  mediaId!: string;
  @PrimaryColumn({ type: 'varchar', length: 16 }) kind!:
    'thumbnail' | 'medium' | 'large';
  @Column({ name: 'storage_key', type: 'varchar', length: 512, select: false })
  storageKey!: string;
  @Column({ type: 'integer' }) width!: number;
  @Column({ type: 'integer' }) height!: number;
  @Column({ type: 'integer' }) size!: number;
}
