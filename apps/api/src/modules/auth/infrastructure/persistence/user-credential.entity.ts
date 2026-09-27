import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_credentials')
@Check(
  'ck_user_credentials_hash',
  'char_length(password_hash) BETWEEN 20 AND 255',
)
export class UserCredential {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', { name: 'fk_user_credentials_user', onDelete: 'CASCADE' })
  userId!: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
