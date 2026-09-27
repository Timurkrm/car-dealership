import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { UserIdentity } from '../../users';
import type { MessageCreatedEvent } from '../../outbox';
import { ConversationParticipant } from '../infrastructure/persistence/conversation-participant.entity';
import { Message } from '../infrastructure/persistence/message.entity';

@Injectable()
export class MessageEventReader {
  constructor(@Inject(UserIdentity) private readonly users: UserIdentity) {}

  async notificationContext(
    event: MessageCreatedEvent,
    manager: EntityManager,
  ) {
    const message = await manager.findOneBy(Message, {
      id: event.payload.messageId,
      conversationId: event.payload.conversationId,
      senderId: event.payload.senderId,
    });
    if (!message) throw new Error('MESSAGE_EVENT_TARGET_MISSING');
    const participants = await manager.findBy(ConversationParticipant, {
      conversationId: event.payload.conversationId,
    });
    const recipientIds = participants
      .map((row) => row.userId)
      .filter((id) => id !== event.payload.senderId);
    const active = await this.users.activeIds(recipientIds, manager);
    const sender = (
      await this.users.publicSummaries([event.payload.senderId], manager)
    )[0];
    if (!sender) throw new Error('MESSAGE_EVENT_SENDER_MISSING');
    return {
      recipientIds: recipientIds.filter((id) => active.has(id)),
      senderPublicName: sender.displayName,
    };
  }
}
