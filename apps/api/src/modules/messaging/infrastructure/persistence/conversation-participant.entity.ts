import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('conversation_participants')
@Index('ix_conversation_participants_user', [
  'userId',
  'joinedAt',
  'conversationId',
])
@Index('ix_conversation_participants_user_conversation', [
  'userId',
  'conversationId',
])
@Check(
  'ck_conversation_participants_read',
  'last_read_at IS NULL OR last_read_at >= joined_at',
)
@ForeignKey(
  'Message',
  ['lastReadMessageId', 'conversationId'],
  ['id', 'conversationId'],
  {
    name: 'fk_conversation_participants_read_message',
    onDelete: 'RESTRICT',
  },
)
export class ConversationParticipant {
  @PrimaryColumn({ name: 'conversation_id', type: 'uuid' })
  @ForeignKey('Conversation', {
    name: 'fk_conversation_participants_conversation',
    onDelete: 'RESTRICT',
  })
  conversationId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', {
    name: 'fk_conversation_participants_user',
    onDelete: 'RESTRICT',
  })
  userId!: string;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt!: Date | null;

  @Column({ name: 'last_read_message_id', type: 'uuid', nullable: true })
  lastReadMessageId!: string | null;
}
