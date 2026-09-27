import { Check, Column, Entity, ForeignKey, Index } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';
import type {
  ModerationActionName,
  ModerationTargetType,
} from '../../domain/moderation.types';

@Entity('moderation_actions')
@Index('ix_moderation_actions_moderator', ['moderatorId', 'createdAt', 'id'])
@Index('ix_moderation_actions_listing', ['listingId', 'createdAt', 'id'], {
  where: 'listing_id IS NOT NULL',
})
@Index('ix_moderation_actions_user', ['targetUserId', 'createdAt', 'id'], {
  where: 'target_user_id IS NOT NULL',
})
@Index('ix_moderation_actions_message', ['messageId', 'createdAt', 'id'], {
  where: 'message_id IS NOT NULL',
})
@Check(
  'ck_moderation_actions_target',
  "(target_type = 'LISTING' AND listing_id IS NOT NULL AND target_user_id IS NULL AND message_id IS NULL) OR (target_type = 'USER' AND target_user_id IS NOT NULL AND listing_id IS NULL AND message_id IS NULL) OR (target_type = 'MESSAGE' AND message_id IS NOT NULL AND listing_id IS NULL AND target_user_id IS NULL)",
)
@Check(
  'ck_moderation_actions_action',
  "(target_type = 'LISTING' AND action IN ('APPROVE_LISTING', 'REJECT_LISTING', 'ARCHIVE_LISTING', 'REMOVE_LISTING')) OR (target_type = 'USER' AND action IN ('SUSPEND_USER', 'BLOCK_USER', 'RESTORE_USER')) OR (target_type = 'MESSAGE' AND action = 'REDACT_MESSAGE')",
)
@Check(
  'ck_moderation_actions_reason_code',
  "reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'",
)
@Check(
  'ck_moderation_actions_seller_message',
  'seller_message IS NULL OR char_length(btrim(seller_message)) BETWEEN 1 AND 2000',
)
@Check(
  'ck_moderation_actions_internal_note',
  'internal_note IS NULL OR char_length(btrim(internal_note)) BETWEEN 1 AND 2000',
)
@Check(
  'ck_moderation_actions_metadata',
  "jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384",
)
export class ModerationAction extends CreatedRecord {
  @Column({ name: 'moderator_id', type: 'uuid' })
  @ForeignKey('User', {
    name: 'fk_moderation_actions_moderator',
    onDelete: 'RESTRICT',
  })
  moderatorId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType!: ModerationTargetType;

  @Column({ name: 'listing_id', type: 'uuid', nullable: true })
  @ForeignKey('Listing', {
    name: 'fk_moderation_actions_listing',
    onDelete: 'RESTRICT',
  })
  listingId!: string | null;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  @ForeignKey('User', {
    name: 'fk_moderation_actions_user',
    onDelete: 'RESTRICT',
  })
  targetUserId!: string | null;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  @ForeignKey('Message', {
    name: 'fk_moderation_actions_message',
    onDelete: 'RESTRICT',
  })
  messageId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  action!: ModerationActionName;

  @Column({ name: 'reason_code', type: 'varchar', length: 64 })
  reasonCode!: string;

  @Column({
    name: 'seller_message',
    type: 'text',
    select: false,
    nullable: true,
  })
  sellerMessage!: string | null;

  @Column({
    name: 'internal_note',
    type: 'text',
    select: false,
    nullable: true,
  })
  internalNote!: string | null;

  @Column({ type: 'jsonb', select: false, default: {} })
  metadata!: Record<string, unknown>;
}
