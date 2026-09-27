import { Check, Column, Entity, Index } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';

@Entity('part_brands')
@Index('uq_part_brands_slug', ['slug'], { unique: true })
@Check('ck_part_brands_name', 'char_length(btrim(name)) BETWEEN 1 AND 120')
@Check('ck_part_brands_slug', "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
export class PartBrand extends MutableRecord {
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'varchar', length: 120 }) slug!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
