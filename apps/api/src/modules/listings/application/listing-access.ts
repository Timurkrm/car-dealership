import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ListingPersistence } from '../infrastructure/persistence/listing.persistence';
import { Listing } from '../infrastructure/persistence/listing.entity';
import { listingNotFound } from './listing-queries';
@Injectable()
export class ListingAccess {
  constructor(
    @Inject(ListingPersistence)
    private readonly persistence: ListingPersistence,
  ) {}
  async owned(id: string, actor: string, manager: EntityManager, lock = false) {
    const row = lock
      ? await this.persistence.lockOwned(id, actor, manager)
      : await this.persistence.findOwned(id, actor, manager);
    if (!row) throw listingNotFound();
    return { id: row.id, sellerId: row.sellerId, status: row.status };
  }
  async lockForMedia(id: string, manager: EntityManager) {
    const row = await manager
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .where({ id })
      .setLock('pessimistic_write')
      .getOne();
    if (!row) throw listingNotFound();
    return { id: row.id, sellerId: row.sellerId, status: row.status };
  }
}
