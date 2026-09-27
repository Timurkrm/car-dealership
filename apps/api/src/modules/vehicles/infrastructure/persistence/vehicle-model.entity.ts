import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type { VehicleMake } from './vehicle-make.entity';

@Entity('vehicle_models')
@Unique('uq_vehicle_models_make_slug', ['makeId', 'slug'])
@Check('ck_vehicle_models_slug', "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
@Check('ck_vehicle_models_name', 'char_length(btrim(name)) BETWEEN 1 AND 100')
export class VehicleModel extends MutableRecord {
  @Column({ name: 'make_id', type: 'uuid' })
  makeId!: string;

  @ManyToOne('VehicleMake', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'make_id',
    foreignKeyConstraintName: 'fk_vehicle_models_make',
  })
  make!: Relation<VehicleMake>;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  slug!: string;
}
