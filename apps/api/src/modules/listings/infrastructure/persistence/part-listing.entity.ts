import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('part_listings')
@ForeignKey('Listing', ['listingId', 'type'], ['id', 'type'], {
  name: 'fk_part_listings_root',
  onDelete: 'CASCADE',
})
@Index('uq_part_listings_part', ['partId'], { unique: true })
@Check('ck_part_listings_type', "type = 'PART'")
@Check('ck_part_listings_quantity', 'quantity_available BETWEEN 0 AND 1000000')
export class PartListing {
  @PrimaryColumn({ name: 'listing_id', type: 'uuid' }) listingId!: string;
  @Column({ type: 'varchar', length: 16, default: 'PART' }) type!: 'PART';
  @Column({ name: 'part_id', type: 'uuid' })
  @ForeignKey('Part', { name: 'fk_part_listings_part', onDelete: 'RESTRICT' })
  partId!: string;
  @Column({ name: 'quantity_available', type: 'integer', default: 1 })
  quantityAvailable!: number;
}
