import { Check, Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';
import type { ActionTokenPurpose } from '../../domain/auth.types';

@Entity('auth_action_tokens')
@Unique('uq_auth_action_tokens_hash', ['tokenHash'])
@Index('ix_auth_action_tokens_expiry', ['expiresAt'])
@Index('ix_auth_action_tokens_user', ['userId', 'purpose', 'createdAt'])
@Index('uq_auth_action_tokens_live', ['userId', 'purpose'], {
  unique: true,
  where: 'consumed_at IS NULL AND revoked_at IS NULL',
})
@Check(
  'ck_auth_action_tokens_purpose',
  "purpose IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE')",
)
@Check('ck_auth_action_tokens_hash', "token_hash ~ '^[0-9a-f]{64}$'")
@Check(
  'ck_auth_action_tokens_dates',
  'expires_at > created_at AND (consumed_at IS NULL OR consumed_at >= created_at) AND (revoked_at IS NULL OR revoked_at >= created_at)',
)
export class ActionToken extends CreatedRecord {
  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', {
    name: 'fk_auth_action_tokens_user',
    onDelete: 'CASCADE',
  })
  userId!: string;
  @Column({ type: 'varchar', length: 24 }) purpose!: ActionTokenPurpose;
  @Column({ name: 'token_hash', type: 'varchar', length: 64, select: false })
  tokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
  @Column({
    name: 'target_email_normalized',
    type: 'varchar',
    length: 254,
    nullable: true,
    select: false,
  })
  targetEmailNormalized!: string | null;
  @Column({ name: 'retained_session_id', type: 'uuid', nullable: true })
  retainedSessionId!: string | null;
}
