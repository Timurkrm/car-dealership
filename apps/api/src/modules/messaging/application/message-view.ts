import type { Message } from '../infrastructure/persistence/message.entity';

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export function messageView(row: Message): MessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    clientMessageId: row.clientMessageId,
    body: row.deletedAt ? null : row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
