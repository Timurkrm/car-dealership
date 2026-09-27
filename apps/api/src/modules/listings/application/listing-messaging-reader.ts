import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { Listing } from '../infrastructure/persistence/listing.entity';
import { ListingQueries } from './listing-queries';
import type { FavoriteListingCard } from './listing-queries';

/** Narrow listings-module contract used by private marketplace conversations. */
@Injectable()
export class ListingMessagingReader {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingQueries) private readonly queries: ListingQueries,
  ) {}

  async eligibleForConversation(id: string, manager: EntityManager) {
    const listing = await manager.findOne(Listing, {
      where: { id, status: 'PUBLISHED' },
      select: { id: true, sellerId: true, type: true, status: true },
      lock: { mode: 'pessimistic_read' },
    });
    if (!listing) return null;
    const cards = await this.queries.favoriteCardsInTransaction([id], manager);
    return cards.has(id)
      ? { id: listing.id, sellerId: listing.sellerId, type: listing.type }
      : null;
  }

  async state(
    id: string,
    manager: EntityManager = this.database.source.manager,
  ) {
    return manager.findOne(Listing, {
      where: { id },
      select: { id: true, sellerId: true, type: true, status: true },
    });
  }

  cards(
    ids: string[],
    manager: EntityManager = this.database.source.manager,
  ): Promise<Map<string, FavoriteListingCard>> {
    return this.queries.favoriteCardsInTransaction(ids, manager);
  }
}
