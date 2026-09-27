import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('vehicle_listings')
@ForeignKey('Listing', ['listingId', 'type'], ['id', 'type'], {
  name: 'fk_vehicle_listings_root',
  onDelete: 'CASCADE',
})
@Index('ix_vehicle_listings_vehicle', ['vehicleId'])
@Check('ck_vehicle_listings_type', "type = 'VEHICLE'")
export class VehicleListing {
  @PrimaryColumn({ name: 'listing_id', type: 'uuid' }) listingId!: string;
  @Column({ type: 'varchar', length: 16, default: 'VEHICLE' }) type!: 'VEHICLE';
  @Column({ name: 'vehicle_id', type: 'uuid' })
  @ForeignKey('Vehicle', {
    name: 'fk_vehicle_listings_vehicle',
    onDelete: 'RESTRICT',
  })
  vehicleId!: string;
}
