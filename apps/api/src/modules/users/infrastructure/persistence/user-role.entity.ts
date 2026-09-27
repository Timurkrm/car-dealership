import {
  Check,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { UserRoleName } from '../../domain/user.types';

@Entity('user_roles')
@Index('ix_user_roles_role_user', ['role', 'userId'])
@Check('ck_user_roles_role', "role IN ('USER', 'MODERATOR', 'ADMIN')")
export class UserRole {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', { name: 'fk_user_roles_user', onDelete: 'CASCADE' })
  userId!: string;

  @PrimaryColumn({ type: 'varchar', length: 16 })
  role!: UserRoleName;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
