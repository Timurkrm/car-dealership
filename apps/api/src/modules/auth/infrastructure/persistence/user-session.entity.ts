import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';

@Entity('user_sessions')
@Index('ix_user_sessions_user_created', ['userId', 'createdAt', 'id'])
@Index('ix_user_sessions_expiry', ['expiresAt'])
@Check(
  'ck_user_sessions_dates',
  'expires_at > created_at AND (revoked_at IS NULL OR revoked_at >= created_at) AND (last_used_at IS NULL OR last_used_at >= created_at)',
)
export class UserSession extends CreatedRecord {
  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', { name: 'fk_user_sessions_user', onDelete: 'CASCADE' })
  userId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;
}
