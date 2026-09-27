import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';

@Entity('audit_logs')
@Index('ix_audit_logs_actor_created', ['actorUserId', 'createdAt', 'id'])
@Index('ix_audit_logs_target_created', [
  'targetType',
  'targetId',
  'createdAt',
  'id',
])
@Index('ix_audit_logs_created', ['createdAt', 'id'])
@Index('ix_audit_logs_action_created', ['action', 'createdAt', 'id'])
@Check('ck_audit_logs_action', "action ~ '^[A-Z][A-Z0-9_]{0,63}$'")
@Check('ck_audit_logs_target_type', "target_type ~ '^[A-Z][A-Z0-9_]{0,31}$'")
@Check(
  'ck_audit_logs_request_id',
  'request_id IS NULL OR char_length(btrim(request_id)) BETWEEN 1 AND 128',
)
@Check(
  'ck_audit_logs_metadata',
  "jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384",
)
export class AuditLog extends CreatedRecord {
  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  @ForeignKey('User', { name: 'fk_audit_logs_actor', onDelete: 'SET NULL' })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  // Historical target reference deliberately survives deletion; no polymorphic FK.
  @Column({ name: 'target_type', type: 'varchar', length: 32 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'jsonb', select: false, default: {} })
  metadata!: Record<string, unknown>;

  @Column({ name: 'request_id', type: 'varchar', length: 128, nullable: true })
  requestId!: string | null;
}
