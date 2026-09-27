import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import type { AuthenticatedPrincipal } from '../../auth';
import { ListingMessagingReader } from '../../listings';
import { UserIdentity } from '../../users';
import { Conversation } from '../infrastructure/persistence/conversation.entity';
import { ConversationParticipant } from '../infrastructure/persistence/conversation-participant.entity';
import { conversationUnavailable, selfConversation } from './messaging-errors';

@Injectable()
export class ConversationCommands {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingMessagingReader)
    private readonly listings: ListingMessagingReader,
    @Inject(UserIdentity) private readonly users: UserIdentity,
  ) {}

  async open(principal: AuthenticatedPrincipal, listingId: string) {
    const result = await this.database.source.transaction(async (manager) => {
      const listing = await this.listings.eligibleForConversation(
        listingId,
        manager,
      );
      if (!listing) throw conversationUnavailable();
      if (listing.sellerId === principal.userId) throw selfConversation();
      const active = await this.users.activeIds([listing.sellerId], manager);
      if (!active.has(listing.sellerId)) throw conversationUnavailable();

      const id = randomUUID();
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(Conversation)
        .values({
          id,
          listingId,
          buyerId: principal.userId,
          lastMessageAt: null,
        })
        .orIgnore()
        .returning('id')
        .execute();
      const created = Array.isArray(inserted.raw) && inserted.raw.length > 0;
      const conversationId = created
        ? id
        : (
            await manager.findOneByOrFail(Conversation, {
              listingId,
              buyerId: principal.userId,
            })
          ).id;
      if (created)
        await manager.insert(ConversationParticipant, [
          {
            conversationId,
            userId: principal.userId,
            lastReadAt: null,
            lastReadMessageId: null,
          },
          {
            conversationId,
            userId: listing.sellerId,
            lastReadAt: null,
            lastReadMessageId: null,
          },
        ]);
      return { id: conversationId, listingId, created };
    });
    return result;
  }
}
