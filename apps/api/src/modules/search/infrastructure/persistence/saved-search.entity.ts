import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';

@Entity('saved_searches')
@Index('ix_saved_searches_user_created', ['userId', 'createdAt', 'id'])
@Index('ix_saved_searches_enabled_type', ['listingType', 'id'], {
  where: 'notifications_enabled = true',
})
@Index(
  'uq_saved_searches_user_fingerprint',
  ['userId', 'listingType', 'filterFingerprint'],
  { unique: true },
)
@Check('ck_saved_searches_name', 'char_length(btrim(name)) BETWEEN 1 AND 120')
@Check(
  'ck_saved_searches_filters',
  "jsonb_typeof(filters) = 'object' AND octet_length(filters::text) <= 16384",
)
@Check('ck_saved_searches_version', 'schema_version > 0')
@Check('ck_saved_searches_listing_type', "listing_type IN ('VEHICLE', 'PART')")
@Check('ck_saved_searches_fingerprint', "filter_fingerprint ~ '^[0-9a-f]{64}$'")
export class SavedSearch extends MutableRecord {
  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', { name: 'fk_saved_searches_user', onDelete: 'CASCADE' })
  userId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'jsonb' })
  filters!: Record<string, unknown>;

  @Column({ name: 'listing_type', type: 'varchar', length: 16 })
  listingType!: 'VEHICLE' | 'PART';

  @Column({ name: 'filter_fingerprint', type: 'varchar', length: 64 })
  filterFingerprint!: string;

  @Column({ name: 'schema_version', type: 'integer', default: 1 })
  schemaVersion!: number;

  @Column({ name: 'notifications_enabled', type: 'boolean', default: false })
  notificationsEnabled!: boolean;
}
