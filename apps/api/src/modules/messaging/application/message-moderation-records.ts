import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ApiException } from '../../../platform/http/api-error';
import { ConversationParticipant } from '../infrastructure/persistence/conversation-participant.entity';
import { Conversation } from '../infrastructure/persistence/conversation.entity';
import { Message } from '../infrastructure/persistence/message.entity';

@Injectable()
export class MessageModerationRecords {
  async disableListingConversations(
    listingId: string,
    manager: EntityManager,
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder()
      .update(Conversation)
      .set({ sendDisabledAt: () => 'CURRENT_TIMESTAMP' })
      .where('listing_id = :listingId AND send_disabled_at IS NULL', {
        listingId,
      })
      .execute();
    return result.affected ?? 0;
  }

  async assertReportable(
    messageId: string,
    reporterId: string,
    manager: EntityManager,
  ) {
    const message = await manager.findOneBy(Message, { id: messageId });
    if (!message)
      throw new ApiException(
        404,
        'REPORT_INVALID_TARGET',
        'Report target not found',
      );
    const participant = await manager.findOneBy(ConversationParticipant, {
      conversationId: message.conversationId,
      userId: reporterId,
    });
    if (!participant)
      throw new ApiException(
        404,
        'REPORT_INVALID_TARGET',
        'Report target not found',
      );
    if (message.senderId === reporterId)
      throw new ApiException(
        400,
        'REPORT_SELF_TARGET',
        'You cannot report your own content',
      );
    return { id: message.id, senderId: message.senderId };
  }

  async context(messageId: string, manager: EntityManager) {
    const reported = await manager
      .getRepository(Message)
      .createQueryBuilder('message')
      .addSelect('message.body')
      .where('message.id = :messageId', { messageId })
      .getOne();
    if (!reported) return null;
    const before = await this.side(reported, manager, 'before');
    const after = await this.side(reported, manager, 'after');
    return {
      reportedMessageId: reported.id,
      conversationId: reported.conversationId,
      messages: [...before.reverse(), reported, ...after].map((message) => ({
        id: message.id,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        deletedAt: message.deletedAt?.toISOString() ?? null,
        isReported: message.id === reported.id,
      })),
    };
  }

  private side(
    reported: Message,
    manager: EntityManager,
    direction: 'before' | 'after',
  ): Promise<Message[]> {
    const comparison = direction === 'before' ? '<' : '>';
    const order = direction === 'before' ? 'DESC' : 'ASC';
    return manager
      .getRepository(Message)
      .createQueryBuilder('message')
      .addSelect('message.body')
      .where('message.conversationId = :conversationId', {
        conversationId: reported.conversationId,
      })
      .andWhere(
        `(message.createdAt ${comparison} :createdAt OR (message.createdAt = :createdAt AND message.id ${comparison} :id))`,
        { createdAt: reported.createdAt, id: reported.id },
      )
      .orderBy('message.createdAt', order)
      .addOrderBy('message.id', order)
      .limit(2)
      .getMany();
  }
}
