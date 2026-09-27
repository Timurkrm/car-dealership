import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import type { AuthenticatedPrincipal } from '../../auth';
import { SavedSearch } from '../infrastructure/persistence/saved-search.entity';
import {
  hasMeaningfulSavedSearchFilter,
  parseSavedSearchFilters,
  SEARCH_SCHEMA_VERSION,
} from '../domain/search-query';
import type {
  CreateSavedSearchInput,
  UpdateSavedSearchInput,
} from '../http/saved-search.dto';

@Injectable()
export class SavedSearches {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    input: CreateSavedSearchInput,
  ) {
    const canonical = this.canonical(input.type, input.filters);
    if (
      input.notificationsEnabled &&
      !hasMeaningfulSavedSearchFilter(canonical.filters)
    )
      throw new ApiException(
        400,
        'SAVED_SEARCH_TOO_BROAD',
        'At least one meaningful filter is required for notifications',
      );
    const id = await this.database.source.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`saved-search:${principal.userId}`],
      );
      const count = await manager.countBy(SavedSearch, {
        userId: principal.userId,
      });
      if (count >= this.config.engagement.savedSearchMaxPerUser)
        throw new ApiException(
          409,
          'SAVED_SEARCH_LIMIT_EXCEEDED',
          'Saved search limit reached',
        );
      try {
        const id = randomUUID();
        const result = await manager.insert(SavedSearch, {
          id,
          userId: principal.userId,
          name: input.name,
          listingType: input.type,
          filters: canonical.filters,
          filterFingerprint: canonical.fingerprint,
          schemaVersion: SEARCH_SCHEMA_VERSION,
          notificationsEnabled: input.notificationsEnabled,
        });
        if (!result.identifiers.length)
          throw new Error('SAVED_SEARCH_INSERT_FAILED');
        return id;
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ApiException(
            409,
            'SAVED_SEARCH_DUPLICATE',
            'An equivalent saved search already exists',
          );
        throw error;
      }
    });
    return this.one(principal.userId, id);
  }

  async list(principal: AuthenticatedPrincipal) {
    const rows = await this.database.source.manager.find(SavedSearch, {
      where: { userId: principal.userId },
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: this.config.engagement.savedSearchMaxPerUser,
    });
    return {
      items: rows.map((row) => this.map(row)),
      limit: this.config.engagement.savedSearchMaxPerUser,
    };
  }

  async update(
    principal: AuthenticatedPrincipal,
    id: string,
    input: UpdateSavedSearchInput,
  ) {
    if (input.name === undefined && input.notificationsEnabled === undefined)
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'At least one field is required',
      );
    await this.database.source.transaction(async (manager) => {
      const row = await manager
        .getRepository(SavedSearch)
        .createQueryBuilder('search')
        .where('search.id = :id AND search.userId = :userId', {
          id,
          userId: principal.userId,
        })
        .setLock('pessimistic_write')
        .getOne();
      if (!row) throw savedSearchNotFound();
      if (row.schemaVersion !== SEARCH_SCHEMA_VERSION)
        throw new ApiException(
          409,
          'SAVED_SEARCH_SCHEMA_UNSUPPORTED',
          'This saved search must be recreated',
        );
      if (input.notificationsEnabled === true) {
        const canonical = this.canonical(row.listingType, row.filters);
        if (!hasMeaningfulSavedSearchFilter(canonical.filters))
          throw new ApiException(
            400,
            'SAVED_SEARCH_TOO_BROAD',
            'At least one meaningful filter is required for notifications',
          );
      }
      await manager.update(
        SavedSearch,
        { id, userId: principal.userId },
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.notificationsEnabled !== undefined
            ? { notificationsEnabled: input.notificationsEnabled }
            : {}),
        },
      );
    });
    return this.one(principal.userId, id);
  }

  async remove(principal: AuthenticatedPrincipal, id: string): Promise<void> {
    await this.database.source.manager.delete(SavedSearch, {
      id,
      userId: principal.userId,
    });
  }

  private canonical(type: 'VEHICLE' | 'PART', filters: unknown) {
    try {
      return parseSavedSearchFilters(type, filters);
    } catch (error) {
      if (error instanceof ApiException) {
        if (error.code === 'SAVED_SEARCH_LOCATION_NOT_SAVABLE') throw error;
        throw new ApiException(
          400,
          'SAVED_SEARCH_INVALID_FILTERS',
          'Saved search filters are invalid',
          error.details,
        );
      }
      throw error;
    }
  }

  private async one(userId: string, id: string) {
    const row = await this.database.source.manager.findOneBy(SavedSearch, {
      id,
      userId,
    });
    if (!row) throw savedSearchNotFound();
    return this.map(row);
  }

  private map(row: SavedSearch) {
    const supported = row.schemaVersion === SEARCH_SCHEMA_VERSION;
    return {
      id: row.id,
      name: row.name,
      type: row.listingType,
      schemaVersion: row.schemaVersion,
      supported,
      filters: supported ? row.filters : {},
      notificationsEnabled: supported && row.notificationsEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function savedSearchNotFound(): ApiException {
  return new ApiException(
    404,
    'SAVED_SEARCH_NOT_FOUND',
    'Saved search not found',
  );
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505',
  );
}
