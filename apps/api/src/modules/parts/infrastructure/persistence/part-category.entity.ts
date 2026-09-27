import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';

@Entity('part_categories')
@Index('uq_part_categories_slug', ['slug'], { unique: true })
@Index('ix_part_categories_parent_order', ['parentId', 'sortOrder', 'id'])
@Check('ck_part_categories_parent', 'parent_id IS NULL OR parent_id <> id')
@Check('ck_part_categories_name', 'char_length(btrim(name)) BETWEEN 1 AND 120')
@Check('ck_part_categories_slug', "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
@Check('ck_part_categories_order', 'sort_order >= 0')
export class PartCategory extends MutableRecord {
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  @ForeignKey('PartCategory', {
    name: 'fk_part_categories_parent',
    onDelete: 'RESTRICT',
  })
  parentId!: string | null;
  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'varchar', length: 120 }) slug!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;
}
