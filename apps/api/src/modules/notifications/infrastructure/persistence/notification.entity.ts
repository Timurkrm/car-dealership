import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';
import type { NotificationType } from '../../domain/notification.types';

@Entity('notifications')
@Index('ix_notifications_user_created', ['userId', 'createdAt', 'id'])
@Index('ix_notifications_user_unread', ['userId', 'createdAt', 'id'], {
  where: 'read_at IS NULL',
})
@Index(
  'uq_notifications_event_recipient_type',
  ['userId', 'sourceEventId', 'type'],
  { unique: true, where: 'source_event_id IS NOT NULL' },
)
@Check(
  'ck_notifications_type',
  "type IN ('NEW_MESSAGE', 'LISTING_STATUS_CHANGED', 'MODERATION_RESULT', 'ACCOUNT_STATUS_CHANGED', 'PRICE_CHANGED', 'SAVED_SEARCH_MATCH', 'FAVORITE_LISTING_STATUS_CHANGED')",
)
@Check(
  'ck_notifications_payload',
  "jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384 AND payload ? 'schemaVersion' AND (payload->>'schemaVersion') ~ '^[1-9][0-9]*$'",
)
@Check('ck_notifications_read', 'read_at IS NULL OR read_at >= created_at')
export class Notification extends CreatedRecord {
  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', { name: 'fk_notifications_user', onDelete: 'CASCADE' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: NotificationType;

  @Column({ type: 'jsonb', select: false })
  payload!: Record<string, unknown>;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'source_event_id', type: 'uuid', nullable: true })
  @ForeignKey('OutboxEvent', {
    name: 'fk_notifications_source_event',
    onDelete: 'RESTRICT',
  })
  sourceEventId!: string | null;
}
