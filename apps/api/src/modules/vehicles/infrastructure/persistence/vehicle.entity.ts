import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type {
  BodyType,
  DriveType,
  FuelType,
  Transmission,
  VehicleColor,
  VehicleCondition,
} from '../../domain/vehicle.types';
import type { VehicleModel } from './vehicle-model.entity';

@Entity('vehicles')
@ForeignKey(
  'VehicleGeneration',
  ['generationId', 'modelId'],
  ['id', 'modelId'],
  { name: 'fk_vehicles_generation_model', onDelete: 'RESTRICT' },
)
@Index('ix_vehicles_model_year', ['modelId', 'year', 'id'])
@Index('ix_vehicles_generation_model', ['generationId', 'modelId'])
@Index('ix_vehicles_body_fuel', ['bodyType', 'fuelType', 'id'])
@Check('ck_vehicles_year', 'year BETWEEN 1886 AND 2100')
@Check('ck_vehicles_mileage', 'mileage_km >= 0')
@Check(
  'ck_vehicles_engine',
  '(engine_power_hp IS NULL OR engine_power_hp > 0) AND (engine_displacement_cc IS NULL OR engine_displacement_cc > 0)',
)
@Check('ck_vehicles_vin', "vin IS NULL OR vin ~ '^[A-HJ-NPR-Z0-9]{17}$'")
@Check(
  'ck_vehicles_body',
  "body_type IN ('SEDAN', 'HATCHBACK', 'SUV', 'COUPE', 'WAGON', 'CONVERTIBLE', 'VAN', 'PICKUP', 'OTHER')",
)
@Check(
  'ck_vehicles_fuel',
  "fuel_type IN ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'PLUG_IN_HYBRID', 'LPG', 'HYDROGEN', 'OTHER')",
)
@Check(
  'ck_vehicles_transmission',
  "transmission IN ('MANUAL', 'AUTOMATIC', 'OTHER')",
)
@Check('ck_vehicles_drive', "drive_type IN ('FWD', 'RWD', 'AWD', 'OTHER')")
@Check('ck_vehicles_condition', "condition IN ('NEW', 'USED', 'DAMAGED')")
@Check(
  'ck_vehicles_color',
  "color IS NULL OR color IN ('BLACK', 'WHITE', 'GRAY', 'SILVER', 'BLUE', 'RED', 'GREEN', 'BROWN', 'BEIGE', 'YELLOW', 'ORANGE', 'PURPLE', 'OTHER')",
)
export class Vehicle extends MutableRecord {
  @Column({ name: 'model_id', type: 'uuid' })
  modelId!: string;

  @ManyToOne('VehicleModel', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'model_id',
    foreignKeyConstraintName: 'fk_vehicles_model',
  })
  model!: Relation<VehicleModel>;

  @Column({ name: 'generation_id', type: 'uuid', nullable: true })
  generationId!: string | null;

  @Column({ type: 'smallint' })
  year!: number;

  @Column({ name: 'mileage_km', type: 'integer' })
  mileageKm!: number;

  @Column({ name: 'body_type', type: 'varchar', length: 16 })
  bodyType!: BodyType;

  @Column({ name: 'fuel_type', type: 'varchar', length: 24 })
  fuelType!: FuelType;

  @Column({ type: 'varchar', length: 16 })
  transmission!: Transmission;

  @Column({ name: 'drive_type', type: 'varchar', length: 8 })
  driveType!: DriveType;

  @Column({ name: 'engine_power_hp', type: 'integer', nullable: true })
  enginePowerHp!: number | null;

  @Column({ name: 'engine_displacement_cc', type: 'integer', nullable: true })
  engineDisplacementCc!: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  color!: VehicleColor | null;

  @Column({ type: 'varchar', length: 17, nullable: true, select: false })
  vin!: string | null;

  @Column({ type: 'varchar', length: 16 })
  condition!: VehicleCondition;
}
