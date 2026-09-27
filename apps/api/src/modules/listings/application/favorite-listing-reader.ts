import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { Listing } from '../infrastructure/persistence/listing.entity';
import { ListingQueries } from './listing-queries';
import type { FavoriteListingCard } from './listing-queries';

@Injectable()
export class FavoriteListingReader {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingQueries) private readonly queries: ListingQueries,
  ) {}

  async favoritable(
    id: string,
    manager: EntityManager,
  ): Promise<{ id: string; type: 'VEHICLE' | 'PART' } | null> {
    const listing = await manager
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .select(['listing.id', 'listing.type', 'listing.status'])
      .where("listing.id = :id AND listing.status = 'PUBLISHED'", { id })
      .setLock('pessimistic_read')
      .getOne();
    if (!listing) return null;
    const cards = await this.queries.favoriteCardsInTransaction([id], manager);
    return cards.has(id) ? { id, type: listing.type } : null;
  }

  cards(
    ids: string[],
    manager: EntityManager = this.database.source.manager,
  ): Promise<Map<string, FavoriteListingCard>> {
    return this.queries.favoriteCardsInTransaction(ids, manager);
  }
}
