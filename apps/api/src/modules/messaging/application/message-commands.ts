import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { RealtimePublisher } from '../../../platform/realtime/realtime-publisher';
import { REALTIME_EVENTS } from '../../../platform/realtime/realtime-events';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import type { AuthenticatedPrincipal } from '../../auth';
import { ListingMessagingReader } from '../../listings';
import { OutboxWriter } from '../../outbox';
import { UserIdentity } from '../../users';
import { Conversation } from '../infrastructure/persistence/conversation.entity';
import { ConversationParticipant } from '../infrastructure/persistence/conversation-participant.entity';
import { Message } from '../infrastructure/persistence/message.entity';
import {
  conversationNotFound,
  idempotencyConflict,
  invalidMessage,
  messagingReadOnly,
} from './messaging-errors';
import { messageView } from './message-view';

@Injectable()
export class MessageCommands {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingMessagingReader)
    private readonly listings: ListingMessagingReader,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async send(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    input: { clientMessageId: string; body: string },
  ) {
    const body = normalizeMessage(
      input.body,
      this.config.messaging.maxBodyCodePoints,
    );
    const committed = await this.database.source.transaction(
      async (manager) => {
        const participant = await manager.findOneBy(ConversationParticipant, {
          conversationId,
          userId: principal.userId,
        });
        if (!participant) throw conversationNotFound();
        const conversation = await manager
          .getRepository(Conversation)
          .createQueryBuilder('conversation')
          .setLock('pessimistic_write')
          .where('conversation.id = :conversationId', { conversationId })
          .getOne();
        if (!conversation) throw conversationNotFound();
        if (conversation.sendDisabledAt) throw messagingReadOnly();
        const listing = await this.listings.state(
          conversation.listingId,
          manager,
        );
        if (
          !listing ||
          !['PUBLISHED', 'SOLD', 'ARCHIVED'].includes(listing.status)
        )
          throw messagingReadOnly();
        const participants = await manager.findBy(ConversationParticipant, {
          conversationId,
        });
        const active = await this.users.activeIds(
          participants.map((row) => row.userId),
          manager,
        );
        if (active.size !== participants.length) throw messagingReadOnly();

        const id = randomUUID();
        const insert = await manager
          .createQueryBuilder()
          .insert()
          .into(Message)
          .values({
            id,
            conversationId,
            senderId: principal.userId,
            clientMessageId: input.clientMessageId,
            body,
            editedAt: null,
            deletedAt: null,
          })
          .orIgnore()
          .returning('id')
          .execute();
        const inserted = Array.isArray(insert.raw) && insert.raw.length > 0;
        const message = await manager
          .getRepository(Message)
          .createQueryBuilder('message')
          .addSelect('message.body')
          .where(
            inserted
              ? 'message.id = :id'
              : 'message.conversationId = :conversationId AND message.senderId = :senderId AND message.clientMessageId = :clientMessageId',
            inserted
              ? { id }
              : {
                  conversationId,
                  senderId: principal.userId,
                  clientMessageId: input.clientMessageId,
                },
          )
          .getOneOrFail();
        if (!inserted && message.body !== body) throw idempotencyConflict();
        if (inserted) {
          await manager.update(
            Conversation,
            { id: conversationId },
            { lastMessageAt: message.createdAt },
          );
          await this.outbox.messageCreated(
            {
              schemaVersion: 1,
              messageId: message.id,
              conversationId,
              listingId: conversation.listingId,
              senderId: principal.userId,
            },
            manager,
          );
        }
        return {
          message: messageView(message),
          inserted,
          participantIds: participants.map((row) => row.userId),
        };
      },
    );
    if (committed.inserted) {
      await this.realtime.users(
        committed.participantIds,
        REALTIME_EVENTS.messageCreated,
        committed.message,
      );
      await this.realtime.users(
        committed.participantIds,
        REALTIME_EVENTS.conversationUpdated,
        { conversationId, message: committed.message },
      );
    }
    return committed.message;
  }
}

export function normalizeMessage(value: string, maximum = 8000): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim().normalize('NFC');
  const count = [...normalized].length;
  if (count < 1 || count > maximum) throw invalidMessage();
  return normalized;
}
