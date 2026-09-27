import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { GeoPoint } from '../../domain/location.types';

@Entity('listing_locations')
@Index('ix_listing_locations_point', ['point'], { spatial: true })
@Index('ix_listing_locations_public_point', ['publicPoint'], {
  spatial: true,
  where: 'public_point IS NOT NULL',
})
// Expression indexes must be maintained by SQL migrations, not ORM schema generation.
@Index('ix_listing_locations_geography', { synchronize: false })
@Check(
  'ck_listing_locations_point',
  'NOT ST_IsEmpty(point) AND ST_X(point) BETWEEN -180 AND 180 AND ST_Y(point) BETWEEN -90 AND 90',
)
@Check(
  'ck_listing_locations_public_point',
  'public_point IS NULL OR (NOT ST_IsEmpty(public_point) AND ST_X(public_point) BETWEEN -180 AND 180 AND ST_Y(public_point) BETWEEN -90 AND 90)',
)
@Check('ck_listing_locations_country', "country_code ~ '^[A-Z]{2}$'")
@Check(
  'ck_listing_locations_city',
  'char_length(btrim(city)) BETWEEN 1 AND 120',
)
export class ListingLocation {
  @PrimaryColumn({ name: 'listing_id', type: 'uuid' })
  @ForeignKey('Listing', {
    name: 'fk_listing_locations_listing',
    onDelete: 'CASCADE',
  })
  listingId!: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    select: false,
  })
  point!: GeoPoint;

  @Column({
    name: 'public_point',
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  publicPoint!: GeoPoint | null;

  @Column({ type: 'varchar', length: 120 })
  city!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region!: string | null;

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
