import { Check, Column, Entity, Index, Unique } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type { UserStatus } from '../../domain/user.types';

@Entity('users')
@Unique('uq_users_email_normalized', ['emailNormalized'])
@Index('ix_users_admin_status_created', ['status', 'createdAt', 'id'])
@Check(
  'ck_users_email_normalized',
  "email_normalized = lower(btrim(email_normalized)) AND email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+$'",
)
@Check(
  'ck_users_display_name',
  'char_length(btrim(display_name)) BETWEEN 1 AND 100',
)
@Check(
  'ck_users_status',
  "status IN ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'PENDING_VERIFICATION')",
)
export class User extends MutableRecord {
  @Column({
    name: 'email_normalized',
    type: 'varchar',
    length: 254,
    select: false,
  })
  emailNormalized!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING_VERIFICATION' })
  status!: UserStatus;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;
}
