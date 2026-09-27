import { Check, Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import { CreatedRecord } from '../../../../platform/database/record';

@Entity('messages')
@ForeignKey(
  'ConversationParticipant',
  ['conversationId', 'senderId'],
  ['conversationId', 'userId'],
  { name: 'fk_messages_sender_participant', onDelete: 'RESTRICT' },
)
@Index('ix_messages_conversation_cursor', ['conversationId', 'createdAt', 'id'])
@Index('ix_messages_sender', ['senderId'])
@Unique('uq_messages_id_conversation', ['id', 'conversationId'])
@Unique('uq_messages_sender_client', [
  'conversationId',
  'senderId',
  'clientMessageId',
])
@Check('ck_messages_body', 'char_length(btrim(body)) BETWEEN 1 AND 8000')
@Check(
  'ck_messages_dates',
  '(edited_at IS NULL OR edited_at >= created_at) AND (deleted_at IS NULL OR deleted_at >= created_at)',
)
export class Message extends CreatedRecord {
  @Column({ name: 'conversation_id', type: 'uuid' })
  @ForeignKey('Conversation', {
    name: 'fk_messages_conversation',
    onDelete: 'RESTRICT',
  })
  conversationId!: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  @Column({ name: 'client_message_id', type: 'uuid' })
  clientMessageId!: string;

  @Column({ type: 'text', select: false })
  body!: string;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt!: Date | null;

  // Explicit redaction marker: keep referential history, redact body in the same operation.
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
