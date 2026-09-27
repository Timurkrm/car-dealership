import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('favorites')
@Index('ix_favorites_user_created', ['userId', 'createdAt', 'listingId'])
@Index('ix_favorites_user_type_created', [
  'userId',
  'listingType',
  'createdAt',
  'listingId',
])
@Index('ix_favorites_listing', ['listingId'])
@Check('ck_favorites_listing_type', "listing_type IN ('VEHICLE', 'PART')")
export class Favorite {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', { name: 'fk_favorites_user', onDelete: 'CASCADE' })
  userId!: string;

  @PrimaryColumn({ name: 'listing_id', type: 'uuid' })
  @ForeignKey('Listing', { name: 'fk_favorites_listing', onDelete: 'CASCADE' })
  listingId!: string;

  @Column({ name: 'listing_type', type: 'varchar', length: 16 })
  listingType!: 'VEHICLE' | 'PART';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
