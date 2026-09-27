import { Check, Column, Entity, Unique } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';

@Entity('vehicle_makes')
@Unique('uq_vehicle_makes_slug', ['slug'])
@Check('ck_vehicle_makes_slug', "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
@Check('ck_vehicle_makes_name', 'char_length(btrim(name)) BETWEEN 1 AND 100')
export class VehicleMake extends MutableRecord {
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;
}
