import { Check, Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';

/** Keep consumed hashes until family expiry so rotation does not erase reuse evidence. */
@Entity('session_tokens')
@Unique('uq_session_tokens_hash', ['tokenHash'])
@Index('ix_session_tokens_session', ['sessionId', 'createdAt', 'id'])
@Index('uq_session_tokens_live', ['sessionId'], {
  unique: true,
  where: 'consumed_at IS NULL AND revoked_at IS NULL',
})
@Check('ck_session_tokens_hash', "token_hash ~ '^[0-9a-f]{64}$'")
@Check(
  'ck_session_tokens_dates',
  'expires_at > created_at AND (consumed_at IS NULL OR consumed_at >= created_at) AND (revoked_at IS NULL OR revoked_at >= created_at)',
)
export class SessionToken extends CreatedRecord {
  @Column({ name: 'session_id', type: 'uuid' })
  @ForeignKey('UserSession', {
    name: 'fk_session_tokens_session',
    onDelete: 'CASCADE',
  })
  sessionId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, select: false })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
