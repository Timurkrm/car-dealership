import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';

@Entity('part_fitments')
@ForeignKey(
  'VehicleGeneration',
  ['generationId', 'modelId'],
  ['id', 'modelId'],
  { name: 'fk_part_fitments_generation_model', onDelete: 'RESTRICT' },
)
@Index('ix_part_fitments_model_generation', [
  'modelId',
  'generationId',
  'partId',
])
@Index('uq_part_fitments_selection', { synchronize: false })
@Check(
  'ck_part_fitments_years',
  '(year_from IS NULL OR year_from BETWEEN 1886 AND 2100) AND (year_to IS NULL OR year_to BETWEEN 1886 AND 2100) AND (year_from IS NULL OR year_to IS NULL OR year_from <= year_to)',
)
export class PartFitment extends CreatedRecord {
  @Column({ name: 'part_id', type: 'uuid' })
  @ForeignKey('Part', { name: 'fk_part_fitments_part', onDelete: 'CASCADE' })
  partId!: string;
  @Column({ name: 'model_id', type: 'uuid' })
  @ForeignKey('VehicleModel', {
    name: 'fk_part_fitments_model',
    onDelete: 'RESTRICT',
  })
  modelId!: string;
  @Column({ name: 'generation_id', type: 'uuid', nullable: true })
  generationId!: string | null;
  @Column({ name: 'year_from', type: 'smallint', nullable: true }) yearFrom!:
    number | null;
  @Column({ name: 'year_to', type: 'smallint', nullable: true }) yearTo!:
    number | null;
}
