import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Persistence conventions only; domain entities remain owned by their modules. */
export abstract class UuidRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
}

export abstract class CreatedRecord extends UuidRecord {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

export abstract class MutableRecord extends CreatedRecord {
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
