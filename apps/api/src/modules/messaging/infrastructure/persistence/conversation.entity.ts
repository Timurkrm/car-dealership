import { Entity, Column, ForeignKey, Index } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';

@Entity('conversations')
@Index('ix_conversations_listing_created', ['listingId', 'createdAt', 'id'])
@Index('ix_conversations_activity', ['lastMessageAt', 'id'])
@Index('uq_conversations_listing_buyer', ['listingId', 'buyerId'], {
  unique: true,
})
export class Conversation extends CreatedRecord {
  @Column({ name: 'listing_id', type: 'uuid' })
  @ForeignKey('Listing', {
    name: 'fk_conversations_listing',
    onDelete: 'RESTRICT',
  })
  listingId!: string;

  @Column({ name: 'buyer_id', type: 'uuid' })
  @ForeignKey('User', {
    name: 'fk_conversations_buyer',
    onDelete: 'RESTRICT',
  })
  buyerId!: string;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  /** Same-transaction projection of immutable moderator removal authority. */
  @Column({ name: 'send_disabled_at', type: 'timestamptz', nullable: true })
  sendDisabledAt!: Date | null;
}
