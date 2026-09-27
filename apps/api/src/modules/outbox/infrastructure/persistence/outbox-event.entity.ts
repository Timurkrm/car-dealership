import { Check, Column, Entity, Index } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';
import type { OutboxEventType, OutboxStatus } from '../../domain/outbox.types';

@Entity('outbox_events')
@Index('ix_outbox_events_claim', ['availableAt', 'id'], {
  where: "status IN ('PENDING', 'RETRY')",
})
@Index('ix_outbox_events_processing_lease', ['lockedAt', 'id'], {
  where: "status = 'PROCESSING'",
})
@Check(
  'ck_outbox_events_type',
  "type IN ('LISTING_PUBLISHED', 'LISTING_MARKED_SOLD', 'LISTING_ARCHIVED', 'LISTING_REMOVED_BY_MODERATOR', 'MESSAGE_CREATED')",
)
@Check(
  'ck_outbox_events_status',
  "status IN ('PENDING', 'PROCESSING', 'RETRY', 'PROCESSED', 'FAILED')",
)
@Check(
  'ck_outbox_events_payload',
  "jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 4096",
)
@Check('ck_outbox_events_attempts', 'attempts >= 0')
@Check(
  'ck_outbox_events_dates',
  "(status <> 'PROCESSING' OR locked_at IS NOT NULL) AND (status <> 'PROCESSED' OR processed_at IS NOT NULL)",
)
export class OutboxEvent extends CreatedRecord {
  @Column({ type: 'varchar', length: 48 })
  type!: OutboxEventType;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 32 })
  aggregateType!: 'LISTING' | 'MESSAGE';

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({ type: 'jsonb', select: false })
  payload!: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: OutboxStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz' })
  availableAt!: Date;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  checkpoint!: string | null;

  @Column({
    name: 'last_error_code',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  lastErrorCode!: string | null;
}
