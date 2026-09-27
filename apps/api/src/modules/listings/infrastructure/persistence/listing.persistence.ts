import type { DataSource, EntityManager } from 'typeorm';
import { Listing } from './listing.entity';
import type { ListingStatus } from '../../domain/listing.types';
import type { PageQuery } from '../../../../platform/http/page.dto';
import { validatePrice } from '../../domain/listing.types';
import type { MinorUnits } from '../../domain/listing.types';

/** Atomic persistence primitive. Higher-level transitions/permissions remain application rules. */
export class ListingPersistence {
  constructor(private readonly source: DataSource) {}

  lockOwned(
    id: string,
    sellerId: string,
    manager: EntityManager,
  ): Promise<Listing | null> {
    return manager
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .where({ id, sellerId })
      .setLock('pessimistic_write')
      .getOne();
  }
  async compareAndSet(
    listing: Listing,
    changes: Partial<
      Pick<
        Listing,
        | 'title'
        | 'description'
        | 'priceMinor'
        | 'currency'
        | 'status'
        | 'submittedAt'
        | 'publishedAt'
        | 'soldAt'
        | 'archivedAt'
      >
    >,
    manager: EntityManager,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(Listing)
      .set({
        ...changes,
        version: () => 'version + 1',
        updatedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where(
        'id = :id AND seller_id = :sellerId AND version = :version AND status = :status',
        {
          id: listing.id,
          sellerId: listing.sellerId,
          version: listing.version,
          status: listing.status,
        },
      )
      .execute();
    return result.affected === 1;
  }
  findOwned(
    id: string,
    sellerId: string,
    manager: EntityManager,
  ): Promise<Listing | null> {
    return manager.findOneBy(Listing, { id, sellerId });
  }
  findPublic(id: string, manager: EntityManager): Promise<Listing | null> {
    return manager
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .where('listing.id = :id AND listing.status IN (:...statuses)', {
        id,
        statuses: ['PUBLISHED', 'SOLD'],
      })
      .getOne();
  }
  listOwned(
    query: PageQuery,
    manager: EntityManager,
    seller: {
      id: string;
      status?: ListingStatus;
      type?: 'VEHICLE' | 'PART';
      sort: 'created_newest' | 'updated_newest';
    },
  ): Promise<Listing[]> {
    const builder = manager
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
        'listing.publishedAt',
        'listing.soldAt',
        'listing.version',
        'listing.createdAt',
        'listing.updatedAt',
        'listing.submittedAt',
        'listing.archivedAt',
      ]);
    builder.where('listing.sellerId = :sellerId', { sellerId: seller.id });
    if (seller.status)
      builder.andWhere('listing.status = :status', { status: seller.status });
    if (seller.type)
      builder.andWhere('listing.type = :type', { type: seller.type });
    builder.orderBy(
      seller.sort === 'updated_newest'
        ? 'listing.updatedAt'
        : 'listing.createdAt',
      'DESC',
    );
    return builder
      .addOrderBy('listing.id', 'DESC')
      .limit(query.limit + 1)
      .offset(query.offset)
      .getMany();
  }

  async compareAndSetPrice(input: {
    id: string;
    sellerId: string;
    expectedVersion: number;
    priceMinor: MinorUnits;
    currency: string;
  }): Promise<number | null> {
    validatePrice(input.priceMinor, input.currency);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new RangeError('Expected version must be a positive integer');
    }
    const rows: { version: number }[] = await this.source.query(
      `WITH changed AS (UPDATE listings SET price_minor = $1, currency = $2,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND seller_id = $4 AND version = $5
       RETURNING version) SELECT version FROM changed`,
      [
        input.priceMinor,
        input.currency,
        input.id,
        input.sellerId,
        input.expectedVersion,
      ],
    );
    return rows[0]?.version ?? null;
  }
}
