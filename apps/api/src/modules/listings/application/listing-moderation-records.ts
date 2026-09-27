import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { UserIdentity } from '../../users';
import type { ListingStatus } from '../domain/listing.types';
import { Listing } from '../infrastructure/persistence/listing.entity';
import { ListingPersistence } from '../infrastructure/persistence/listing.persistence';
import { ListingMediaPort } from './listing-media.port';
import { ListingPublicationPolicy } from './listing-publication-policy';
import { ListingQueries, listingNotFound } from './listing-queries';

export interface ModerationQueueFilters {
  type?: 'VEHICLE' | 'PART';
  sellerId?: string;
  listingId?: string;
  submittedFrom?: Date;
  submittedTo?: Date;
  limit: number;
}
export interface ModerationQueuePosition {
  submittedAt: string;
  id: string;
}

@Injectable()
export class ListingModerationRecords {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingPersistence)
    private readonly persistence: ListingPersistence,
    @Inject(ListingQueries) private readonly queries: ListingQueries,
    @Inject(ListingPublicationPolicy)
    private readonly publication: ListingPublicationPolicy,
    @Inject(ListingMediaPort) private readonly media: ListingMediaPort,
    @Inject(UserIdentity) private readonly users: UserIdentity,
  ) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.database.source.transaction(work);
  }

  async lock(id: string, manager: EntityManager): Promise<Listing> {
    const listing = await manager
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .where('listing.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    if (!listing) throw listingNotFound();
    return listing;
  }

  assertPublishable(listing: Listing, manager: EntityManager): Promise<void> {
    return this.publication.assertReady(listing, manager);
  }

  async transition(
    listing: Listing,
    status: ListingStatus,
    manager: EntityManager,
    dates: { publishedAt?: Date; archivedAt?: Date } = {},
  ): Promise<number> {
    const ok = await this.persistence.compareAndSet(
      listing,
      { status, ...dates },
      manager,
    );
    if (!ok) return 0;
    return listing.version + 1;
  }

  async detail(id: string, manager: EntityManager) {
    const listing = await manager.findOneBy(Listing, { id });
    if (!listing) throw listingNotFound();
    return this.queries.ownerInTransaction(id, listing.sellerId, manager);
  }

  async target(id: string, manager: EntityManager) {
    const row = await manager.findOne(Listing, {
      where: { id },
      select: {
        id: true,
        sellerId: true,
        type: true,
        title: true,
        status: true,
        version: true,
      },
    });
    if (!row) throw listingNotFound();
    return row;
  }

  async list(
    filters: ModerationQueueFilters,
    position: ModerationQueuePosition | null,
    manager: EntityManager = this.database.source.manager,
  ) {
    const query = manager
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .select([
        'listing.id',
        'listing.sellerId',
        'listing.type',
        'listing.title',
        'listing.priceMinor',
        'listing.currency',
        'listing.status',
        'listing.submittedAt',
        'listing.version',
      ])
      .where("listing.status = 'PENDING_MODERATION'")
      .andWhere('listing.submittedAt IS NOT NULL');
    if (filters.type)
      query.andWhere('listing.type = :type', { type: filters.type });
    if (filters.sellerId)
      query.andWhere('listing.sellerId = :sellerId', {
        sellerId: filters.sellerId,
      });
    if (filters.listingId)
      query.andWhere('listing.id = :listingId', {
        listingId: filters.listingId,
      });
    if (filters.submittedFrom)
      query.andWhere('listing.submittedAt >= :submittedFrom', {
        submittedFrom: filters.submittedFrom,
      });
    if (filters.submittedTo)
      query.andWhere('listing.submittedAt <= :submittedTo', {
        submittedTo: filters.submittedTo,
      });
    if (position)
      query.andWhere(
        '(listing.submittedAt > :cursorSubmitted OR (listing.submittedAt = :cursorSubmitted AND listing.id > :cursorId))',
        { cursorSubmitted: position.submittedAt, cursorId: position.id },
      );
    const result = await query
      .addSelect(
        `to_char(listing.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'cursor_submitted_at',
      )
      .orderBy('listing.submittedAt', 'ASC')
      .addOrderBy('listing.id', 'ASC')
      .limit(filters.limit + 1)
      .getRawAndEntities();
    const rows = result.entities;
    const cursorSubmittedById = new Map<string, string>(
      rows.map((row, index) => [
        row.id,
        (result.raw[index] as { cursor_submitted_at: string })
          .cursor_submitted_at,
      ]),
    );
    const page = rows.slice(0, filters.limit);
    const covers = await this.media.readMany(
      page.map((row) => row.id),
      manager,
      false,
      true,
    );
    const sellers = await this.users.publicSummaries(
      [...new Set(page.map((row) => row.sellerId))],
      manager,
    );
    const summaries = await this.queries.moderationSummaries(page, manager);
    const sellerById = new Map(sellers.map((row) => [row.id, row]));
    return {
      rows,
      cursorSubmittedById,
      items: page.map((listing) => ({
        id: listing.id,
        type: listing.type,
        title: listing.title,
        price: { amountMinor: listing.priceMinor, currency: listing.currency },
        submittedAt: listing.submittedAt?.toISOString() ?? null,
        version: listing.version,
        seller: sellerById.get(listing.sellerId) ?? {
          id: listing.sellerId,
          displayName: 'Unknown seller',
        },
        cover:
          covers.get(listing.id)?.find((image) => image.isPrimary)?.variants
            ?.thumbnail ?? null,
        subtype: summaries.get(listing.id) ?? null,
      })),
    };
  }

  async sellerCounts(sellerId: string, manager: EntityManager) {
    const rows: {
      type: 'VEHICLE' | 'PART';
      status: ListingStatus;
      count: number;
    }[] = await manager
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .select('listing.type', 'type')
      .addSelect('listing.status', 'status')
      .addSelect('COUNT(*)::integer', 'count')
      .where('listing.sellerId = :sellerId', { sellerId })
      .groupBy('listing.type')
      .addGroupBy('listing.status')
      .getRawMany();
    return rows;
  }
}
