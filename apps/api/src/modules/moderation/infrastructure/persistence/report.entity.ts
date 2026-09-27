import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type {
  ModerationTargetType,
  ReportReason,
  ReportResolution,
  ReportStatus,
} from '../../domain/moderation.types';

@Entity('reports')
@Index('uq_reports_active_listing', { synchronize: false })
@Index('uq_reports_active_user', { synchronize: false })
@Index('uq_reports_active_message', { synchronize: false })
@Index('ix_reports_queue', ['createdAt', 'id'], {
  where: "status IN ('OPEN', 'IN_REVIEW')",
})
@Index('ix_reports_status_queue', ['status', 'createdAt', 'id'])
@Index('ix_reports_reporter', ['reporterId', 'createdAt', 'id'])
@Index('ix_reports_listing', ['listingId'], { where: 'listing_id IS NOT NULL' })
@Index('ix_reports_user', ['targetUserId'], {
  where: 'target_user_id IS NOT NULL',
})
@Index('ix_reports_message', ['messageId'], { where: 'message_id IS NOT NULL' })
@Check(
  'ck_reports_target',
  "(target_type = 'LISTING' AND listing_id IS NOT NULL AND target_user_id IS NULL AND message_id IS NULL) OR (target_type = 'USER' AND target_user_id IS NOT NULL AND listing_id IS NULL AND message_id IS NULL) OR (target_type = 'MESSAGE' AND message_id IS NOT NULL AND listing_id IS NULL AND target_user_id IS NULL)",
)
@Check(
  'ck_reports_status',
  "status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')",
)
@Check(
  'ck_reports_reason_code',
  "reason_code IN ('SCAM', 'SPAM', 'PROHIBITED_CONTENT', 'MISLEADING_INFORMATION', 'HARASSMENT', 'DUPLICATE', 'WRONG_CATEGORY', 'OTHER')",
)
@Check(
  'ck_reports_details',
  'reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 2000',
)
@Check(
  'ck_reports_resolution',
  "(status IN ('RESOLVED', 'DISMISSED')) = (resolved_at IS NOT NULL AND resolution IS NOT NULL) AND (resolved_at IS NULL OR resolved_at >= created_at) AND (resolution IS NULL OR resolution IN ('NO_ACTION', 'CONTENT_REMOVED', 'WARNING', 'OTHER')) AND (resolution_note IS NULL OR char_length(btrim(resolution_note)) BETWEEN 1 AND 2000)",
)
export class Report extends MutableRecord {
  @Column({ name: 'reporter_id', type: 'uuid' })
  @ForeignKey('User', { name: 'fk_reports_reporter', onDelete: 'RESTRICT' })
  reporterId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType!: ModerationTargetType;

  @Column({ name: 'listing_id', type: 'uuid', nullable: true })
  @ForeignKey('Listing', { name: 'fk_reports_listing', onDelete: 'RESTRICT' })
  listingId!: string | null;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  @ForeignKey('User', { name: 'fk_reports_user', onDelete: 'RESTRICT' })
  targetUserId!: string | null;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  @ForeignKey('Message', { name: 'fk_reports_message', onDelete: 'RESTRICT' })
  messageId!: string | null;

  @Column({ name: 'reason_code', type: 'varchar', length: 40 })
  reasonCode!: ReportReason;

  @Column({ name: 'reason', type: 'text', select: false, nullable: true })
  details!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'OPEN' })
  status!: ReportStatus;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  @ForeignKey('User', { name: 'fk_reports_resolved_by', onDelete: 'RESTRICT' })
  resolvedBy!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  resolution!: ReportResolution | null;

  @Column({
    name: 'resolution_note',
    type: 'text',
    select: false,
    nullable: true,
  })
  resolutionNote!: string | null;
}
