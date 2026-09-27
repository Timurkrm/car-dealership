import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';
import type {
  DeliveryStatus,
  EmailTemplate,
} from '../../domain/email-delivery.types';

@Entity('notification_deliveries')
@Index(
  'uq_notification_deliveries_notification_channel',
  ['notificationId', 'channel'],
  {
    unique: true,
    where: 'notification_id IS NOT NULL',
  },
)
@Index('uq_notification_deliveries_dedupe', ['dedupeKey'], { unique: true })
@Index('ix_notification_deliveries_claim', ['availableAt', 'createdAt', 'id'], {
  where: "status IN ('PENDING', 'RETRY')",
})
@Index('ix_notification_deliveries_lease', ['lockedAt', 'id'], {
  where: "status = 'PROCESSING'",
})
@Index('ix_notification_deliveries_user_created', ['userId', 'createdAt', 'id'])
@Check('ck_notification_deliveries_channel', "channel = 'EMAIL'")
@Check(
  'ck_notification_deliveries_status',
  "status IN ('PENDING','PROCESSING','RETRY','SENT','FAILED','SUPPRESSED')",
)
@Check(
  'ck_notification_deliveries_template',
  "template IN ('VERIFY_EMAIL','PASSWORD_RESET','EMAIL_CHANGE_CONFIRMATION','EMAIL_CHANGED','NEW_MESSAGE','SAVED_SEARCH_MATCH','FAVORITE_STATUS_CHANGED','MODERATION_RESULT','ACCOUNT_STATUS_CHANGED')",
)
@Check('ck_notification_deliveries_attempts', 'attempts >= 0')
@Check(
  'ck_notification_deliveries_payload',
  "jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384 AND payload->>'schemaVersion' = '1'",
)
export class NotificationDelivery extends MutableRecord {
  @Column({ name: 'notification_id', type: 'uuid', nullable: true })
  @ForeignKey('Notification', {
    name: 'fk_notification_deliveries_notification',
    onDelete: 'CASCADE',
  })
  notificationId!: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', {
    name: 'fk_notification_deliveries_user',
    onDelete: 'CASCADE',
  })
  userId!: string;

  @Column({ type: 'varchar', length: 16, default: 'EMAIL' })
  channel!: 'EMAIL';

  @Column({ type: 'varchar', length: 48 }) template!: EmailTemplate;
  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: DeliveryStatus;
  @Column({ type: 'boolean', default: false }) mandatory!: boolean;
  @Column({ name: 'dedupe_key', type: 'varchar', length: 160 })
  dedupeKey!: string;
  @Column({
    name: 'recipient_email',
    type: 'varchar',
    length: 254,
    nullable: true,
    select: false,
  })
  recipientEmail!: string | null;
  @Column({ type: 'jsonb', select: false }) payload!: Record<string, unknown>;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ name: 'available_at', type: 'timestamptz' }) availableAt!: Date;
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
  @Column({
    name: 'provider_message_id',
    type: 'varchar',
    length: 256,
    nullable: true,
    select: false,
  })
  providerMessageId!: string | null;
  @Column({
    name: 'last_error_code',
    type: 'varchar',
    length: 64,
    nullable: true,
    select: false,
  })
  lastErrorCode!: string | null;
}
