import { Check, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type { VehicleModel } from './vehicle-model.entity';

@Entity('vehicle_generations')
@Unique('uq_vehicle_generations_model_name', ['modelId', 'name'])
@Unique('uq_vehicle_generations_id_model', ['id', 'modelId'])
@Check(
  'ck_vehicle_generations_name',
  'char_length(btrim(name)) BETWEEN 1 AND 100',
)
@Check(
  'ck_vehicle_generations_years',
  'start_year BETWEEN 1886 AND 2100 AND (end_year IS NULL OR end_year BETWEEN start_year AND 2100)',
)
export class VehicleGeneration extends MutableRecord {
  @Column({ name: 'model_id', type: 'uuid' })
  modelId!: string;

  @ManyToOne('VehicleModel', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'model_id',
    foreignKeyConstraintName: 'fk_vehicle_generations_model',
  })
  model!: Relation<VehicleModel>;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'start_year', type: 'smallint' })
  startYear!: number;

  @Column({ name: 'end_year', type: 'smallint', nullable: true })
  endYear!: number | null;
}
