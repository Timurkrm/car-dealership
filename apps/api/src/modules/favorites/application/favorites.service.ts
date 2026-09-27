import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import { OpaqueCursor } from '../../../platform/http/opaque-cursor';
import type { AuthenticatedPrincipal } from '../../auth';
import { FavoriteListingReader } from '../../listings';
import { Favorite } from '../infrastructure/persistence/favorite.entity';
import type { FavoriteListQuery } from '../http/favorites.dto';

interface FavoritePosition {
  createdAt: string;
  listingId: string;
}

@Injectable()
export class FavoritesService {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(FavoriteListingReader)
    private readonly listings: FavoriteListingReader,
    @Inject(OpaqueCursor) private readonly cursors: OpaqueCursor,
  ) {}

  async add(principal: AuthenticatedPrincipal, listingId: string) {
    const listing = await this.database.source.transaction(async (manager) => {
      const eligible = await this.listings.favoritable(listingId, manager);
      if (!eligible)
        throw new ApiException(
          409,
          'FAVORITE_LISTING_NOT_AVAILABLE',
          'Listing is not available for favorites',
        );
      await manager
        .createQueryBuilder()
        .insert()
        .into(Favorite)
        .values({
          userId: principal.userId,
          listingId,
          listingType: eligible.type,
        })
        .orIgnore()
        .execute();
      return eligible;
    });
    return { listingId, type: listing.type, favorite: true };
  }

  async remove(
    principal: AuthenticatedPrincipal,
    listingId: string,
  ): Promise<void> {
    await this.database.source.manager.delete(Favorite, {
      userId: principal.userId,
      listingId,
    });
  }

  async list(principal: AuthenticatedPrincipal, query: FavoriteListQuery) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ type: query.type ?? null }))
      .digest('base64url');
    const position = this.decode(query.cursor, fingerprint);
    const builder = this.database.source
      .getRepository(Favorite)
      .createQueryBuilder('favorite')
      .select([
        'favorite.userId',
        'favorite.listingId',
        'favorite.listingType',
        'favorite.createdAt',
      ])
      .addSelect(
        `to_char(favorite.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'cursor_created_at',
      )
      .where('favorite.userId = :userId', { userId: principal.userId });
    if (query.type)
      builder.andWhere('favorite.listingType = :type', { type: query.type });
    if (position)
      builder.andWhere(
        '(favorite.createdAt < :cursorCreated OR (favorite.createdAt = :cursorCreated AND favorite.listingId < :cursorId))',
        {
          cursorCreated: position.createdAt,
          cursorId: position.listingId,
        },
      );
    const result = await builder
      .orderBy('favorite.createdAt', 'DESC')
      .addOrderBy('favorite.listingId', 'DESC')
      .limit(query.limit + 1)
      .getRawAndEntities();
    const page = result.entities.slice(0, query.limit);
    const cards = await this.listings.cards(page.map((row) => row.listingId));
    const items = page.map((favorite) => {
      const card = cards.get(favorite.listingId);
      return card
        ? {
            kind: card.type,
            addedAt: favorite.createdAt.toISOString(),
            availability: card.status === 'SOLD' ? 'SOLD' : 'AVAILABLE',
            ...card,
          }
        : {
            kind: 'UNAVAILABLE' as const,
            listingId: favorite.listingId,
            addedAt: favorite.createdAt.toISOString(),
            availability: 'UNAVAILABLE' as const,
          };
    });
    const hasNextPage = result.entities.length > query.limit;
    const lastIndex = page.length - 1;
    const last = page[lastIndex];
    const raw =
      lastIndex >= 0
        ? (result.raw[lastIndex] as { cursor_created_at: string })
        : null;
    return {
      items,
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last && raw
            ? this.cursors.encode('favorites', fingerprint, {
                createdAt: raw.cursor_created_at,
                listingId: last.listingId,
              })
            : null,
      },
    };
  }

  async recipients(
    listingId: string,
    afterUserId: string | null,
    limit: number,
    manager: EntityManager,
  ): Promise<string[]> {
    const query = manager
      .getRepository(Favorite)
      .createQueryBuilder('favorite')
      .select('favorite.userId', 'userId')
      .where('favorite.listingId = :listingId', { listingId });
    if (afterUserId)
      query.andWhere('favorite.userId > :afterUserId', { afterUserId });
    const rows: { userId: string }[] = await query
      .orderBy('favorite.userId', 'ASC')
      .limit(limit)
      .getRawMany();
    return rows.map((row) => row.userId);
  }

  private decode(
    cursor: string | undefined,
    fingerprint: string,
  ): FavoritePosition | null {
    try {
      const value = this.cursors.decode(cursor, 'favorites', fingerprint);
      if (value === null) return null;
      if (
        !value ||
        typeof value !== 'object' ||
        !('createdAt' in value) ||
        typeof value.createdAt !== 'string' ||
        Number.isNaN(Date.parse(value.createdAt)) ||
        !('listingId' in value) ||
        typeof value.listingId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.listingId,
        )
      )
        throw new Error('invalid');
      return value as FavoritePosition;
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === 'CURSOR_QUERY_MISMATCH'
      )
        throw new ApiException(
          400,
          'FAVORITE_CURSOR_QUERY_MISMATCH',
          error.safeMessage,
        );
      throw new ApiException(400, 'FAVORITE_INVALID_CURSOR', 'Invalid cursor');
    }
  }
}
