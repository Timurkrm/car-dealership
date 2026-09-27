import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type { FitmentMode, PartCondition } from '../../domain/part.types';

@Entity('parts')
@Index('ix_parts_category', ['categoryId', 'id'])
@Index('ix_parts_brand', ['brandId', 'id'], { where: 'brand_id IS NOT NULL' })
@Index('ix_parts_manufacturer_number', ['manufacturerPartNumber'], {
  where: 'manufacturer_part_number IS NOT NULL',
})
@Index('ix_parts_oem_number', ['oemNumber'], {
  where: 'oem_number IS NOT NULL',
})
@Check('ck_parts_name', 'char_length(btrim(name)) BETWEEN 1 AND 200')
@Check(
  'ck_parts_condition',
  "condition IN ('NEW', 'USED', 'REFURBISHED', 'FOR_PARTS')",
)
@Check(
  'ck_parts_fitment_mode',
  "fitment_mode IN ('UNIVERSAL', 'VEHICLE_SPECIFIC')",
)
@Check(
  'ck_parts_manufacturer_number',
  "manufacturer_part_number IS NULL OR (manufacturer_part_number = upper(btrim(manufacturer_part_number)) AND manufacturer_part_number ~ '^[A-Z0-9][A-Z0-9 ._/-]*$')",
)
@Check(
  'ck_parts_oem_number',
  "oem_number IS NULL OR (oem_number = upper(btrim(oem_number)) AND oem_number ~ '^[A-Z0-9][A-Z0-9 ._/-]*$')",
)
export class Part extends MutableRecord {
  @Column({ name: 'category_id', type: 'uuid' })
  @ForeignKey('PartCategory', {
    name: 'fk_parts_category',
    onDelete: 'RESTRICT',
  })
  categoryId!: string;
  @Column({ name: 'brand_id', type: 'uuid', nullable: true })
  @ForeignKey('PartBrand', { name: 'fk_parts_brand', onDelete: 'RESTRICT' })
  brandId!: string | null;
  @Column({ type: 'varchar', length: 200 }) name!: string;
  @Column({ type: 'varchar', length: 16 }) condition!: PartCondition;
  @Column({
    name: 'manufacturer_part_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  manufacturerPartNumber!: string | null;
  @Column({ name: 'oem_number', type: 'varchar', length: 100, nullable: true })
  oemNumber!: string | null;
  @Column({ name: 'fitment_mode', type: 'varchar', length: 24 })
  fitmentMode!: FitmentMode;
}
