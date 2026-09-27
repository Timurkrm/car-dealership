import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { PartCatalog, PartRecords } from '../../parts';
import type { FitmentRecord } from '../../parts';
import { SavedSearch } from '../infrastructure/persistence/saved-search.entity';
import { ListingSearchQuery } from '../infrastructure/listing-search-query';
import type {
  MatchingSearchRow,
  PartSearchRow,
  VehicleSearchRow,
} from '../infrastructure/listing-search-query';
import {
  parseSavedSearchFilters,
  SEARCH_SCHEMA_VERSION,
} from '../domain/search-query';
import type {
  PartListingSearchFilters,
  SearchListingType,
  SearchQuery,
  VehicleListingSearchFilters,
} from '../domain/search-query';

export interface SavedSearchCandidate {
  id: string;
  userId: string;
  query: SearchQuery | null;
}

export interface VehicleMatchingSnapshot extends VehicleSearchRow {
  sellerId: string;
  exactLatitude: number | null;
  exactLongitude: number | null;
  type: 'VEHICLE';
}

export interface PartMatchingSnapshot extends PartSearchRow {
  sellerId: string;
  exactLatitude: number | null;
  exactLongitude: number | null;
  type: 'PART';
  categoryAncestorIds: readonly string[];
  fitments: readonly FitmentRecord[];
}

export type ListingMatchingSnapshot =
  VehicleMatchingSnapshot | PartMatchingSnapshot;

@Injectable()
export class SavedSearchMatcher {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingSearchQuery) private readonly searches: ListingSearchQuery,
    @Inject(PartRecords) private readonly parts: PartRecords,
    @Inject(PartCatalog) private readonly catalog: PartCatalog,
  ) {}

  async snapshot(
    listingId: string,
    type: SearchListingType,
  ): Promise<ListingMatchingSnapshot | null> {
    const query = matchingQuery(type);
    const row = await this.searches
      .matchingSnapshot(query, listingId)
      .getRawOne<MatchingSearchRow>();
    if (!row) return null;
    if (row.type === 'VEHICLE') return row as VehicleMatchingSnapshot;
    const partRow = row as MatchingSearchRow & PartSearchRow;
    const record = (
      await this.parts.readMany(
        [partRow.partId],
        this.database.source.manager,
        true,
      )
    )[0];
    if (!record) return null;
    return {
      ...partRow,
      type: 'PART',
      categoryAncestorIds: await this.catalog.activeAncestorIds(
        record.categoryId,
        this.database.source.manager,
      ),
      fitments: record.fitments,
    };
  }

  async candidates(
    type: SearchListingType,
    occurredAt: Date,
    afterId: string | null,
    limit: number,
    manager: EntityManager,
  ): Promise<SavedSearchCandidate[]> {
    const builder = manager
      .getRepository(SavedSearch)
      .createQueryBuilder('search')
      .where('search.notificationsEnabled = true')
      .andWhere('search.listingType = :type', { type })
      .andWhere('search.schemaVersion = :version', {
        version: SEARCH_SCHEMA_VERSION,
      })
      .andWhere('search.createdAt <= :occurredAt', { occurredAt });
    if (afterId) builder.andWhere('search.id > :afterId', { afterId });
    const rows = await builder
      .orderBy('search.id', 'ASC')
      .limit(limit)
      .getMany();
    return rows.map<SavedSearchCandidate>((row) => {
      try {
        const canonical = parseSavedSearchFilters(row.listingType, row.filters);
        return { id: row.id, userId: row.userId, query: canonical.query };
      } catch {
        // Invalid legacy/corrupt rows remain inert rather than poisoning fanout.
        return { id: row.id, userId: row.userId, query: null };
      }
    });
  }
}

export function matchesSavedSearch(
  query: SearchQuery,
  snapshot: ListingMatchingSnapshot,
): boolean {
  if (query.type !== snapshot.type) return false;
  if (!commonMatches(query, snapshot)) return false;
  if (!spatialMatches(query, snapshot)) return false;
  return query.type === 'VEHICLE'
    ? vehicleMatches(query.filters, snapshot as VehicleMatchingSnapshot)
    : partMatches(query.filters, snapshot as PartMatchingSnapshot);
}

function commonMatches(
  query: SearchQuery,
  snapshot: ListingMatchingSnapshot,
): boolean {
  const filters = query.filters;
  if (filters.currency && snapshot.currency !== filters.currency) return false;
  const price = BigInt(snapshot.priceMinor);
  if (
    filters.priceFromMinor !== undefined &&
    price < BigInt(filters.priceFromMinor)
  )
    return false;
  if (
    filters.priceToMinor !== undefined &&
    price > BigInt(filters.priceToMinor)
  )
    return false;
  return true;
}

function spatialMatches(
  query: SearchQuery,
  snapshot: ListingMatchingSnapshot,
): boolean {
  if (query.spatial.mode === 'none') return true;
  if (query.spatial.mode !== 'bbox') return false;
  const latitude = numberOrNull(snapshot.exactLatitude);
  const longitude = numberOrNull(snapshot.exactLongitude);
  if (latitude === null || longitude === null) return false;
  const { west, south, east, north } = query.spatial;
  return (
    latitude >= south &&
    latitude <= north &&
    (west <= east
      ? longitude >= west && longitude <= east
      : longitude >= west || longitude <= east)
  );
}

function vehicleMatches(
  filters: VehicleListingSearchFilters,
  row: VehicleMatchingSnapshot,
): boolean {
  if (filters.makeId && row.makeId !== filters.makeId) return false;
  if (filters.modelId && row.modelId !== filters.modelId) return false;
  if (filters.generationId && row.generationId !== filters.generationId)
    return false;
  if (filters.yearFrom !== undefined && row.year < filters.yearFrom)
    return false;
  if (filters.yearTo !== undefined && row.year > filters.yearTo) return false;
  if (filters.mileageFrom !== undefined && row.mileageKm < filters.mileageFrom)
    return false;
  if (filters.mileageTo !== undefined && row.mileageKm > filters.mileageTo)
    return false;
  for (const key of [
    'bodyType',
    'fuelType',
    'transmission',
    'driveType',
    'condition',
    'color',
  ] as const) {
    const selected = filters[key];
    if (selected?.length && !selected.includes(row[key] ?? '')) return false;
  }
  return true;
}

function partMatches(
  filters: PartListingSearchFilters,
  row: PartMatchingSnapshot,
): boolean {
  if (
    filters.categoryId &&
    (filters.includeSubcategories
      ? !row.categoryAncestorIds.includes(filters.categoryId)
      : row.partCategoryId !== filters.categoryId)
  )
    return false;
  if (filters.brandId && row.partBrandId !== filters.brandId) return false;
  if (
    filters.condition?.length &&
    !filters.condition.includes(row.partCondition as never)
  )
    return false;
  if (
    filters.fitmentMode?.length &&
    !filters.fitmentMode.includes(row.fitmentMode as never)
  )
    return false;
  if (filters.oemNumber && row.oemNumber !== filters.oemNumber) return false;
  if (
    filters.manufacturerPartNumber &&
    row.manufacturerPartNumber !== filters.manufacturerPartNumber
  )
    return false;
  if (
    filters.partNumber &&
    row.oemNumber !== filters.partNumber &&
    row.manufacturerPartNumber !== filters.partNumber
  )
    return false;
  const compatibility =
    filters.compatibleMakeId ||
    filters.compatibleModelId ||
    filters.compatibleGenerationId ||
    filters.compatibleYear !== undefined;
  if (!compatibility) return true;
  if (row.fitmentMode === 'UNIVERSAL') return filters.includeUniversal;
  return row.fitments.some((fitment) => {
    if (
      filters.compatibleMakeId &&
      fitment.make.id !== filters.compatibleMakeId
    )
      return false;
    if (
      filters.compatibleModelId &&
      fitment.model.id !== filters.compatibleModelId
    )
      return false;
    if (
      filters.compatibleGenerationId &&
      fitment.generationId !== null &&
      fitment.generationId !== filters.compatibleGenerationId
    )
      return false;
    if (
      filters.compatibleYear !== undefined &&
      ((fitment.yearFrom != null &&
        fitment.yearFrom > filters.compatibleYear) ||
        (fitment.yearTo != null && fitment.yearTo < filters.compatibleYear))
    )
      return false;
    return true;
  });
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchingQuery(type: SearchListingType): SearchQuery {
  return type === 'VEHICLE'
    ? {
        schemaVersion: 2,
        type,
        filters: {},
        spatial: { mode: 'none' },
        sort: 'newest',
        limit: 1,
      }
    : {
        schemaVersion: 2,
        type,
        filters: { includeSubcategories: true, includeUniversal: true },
        spatial: { mode: 'none' },
        sort: 'newest',
        limit: 1,
      };
}
