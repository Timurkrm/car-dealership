import { Inject, Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { MediaSearchProjection } from '../../media';
import { publicDistance } from '../../geo';
import { PartRecords } from '../../parts';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { StructuredLogger } from '../../../platform/logging/structured-logger';
import {
  ListingSearchQuery,
  rowPosition,
} from '../infrastructure/listing-search-query';
import type {
  CommonSearchRow,
  MapClusterRow,
  PartSearchRow,
  SearchRow,
  VehicleSearchRow,
} from '../infrastructure/listing-search-query';
import { SearchCursor } from '../domain/search-cursor';
import type { SearchQuery } from '../domain/search-query';
import type { MapSearchQuery } from '../domain/map-query';

export function searchLocation(
  row: Pick<
    CommonSearchRow,
    | 'city'
    | 'region'
    | 'countryCode'
    | 'publicLatitude'
    | 'publicLongitude'
    | 'distance'
  >,
) {
  if (row.city === null || row.countryCode === null) return null;
  return {
    city: row.city,
    region: row.region,
    countryCode: row.countryCode,
    publicPoint:
      row.publicLatitude === null || row.publicLongitude === null
        ? null
        : { latitude: row.publicLatitude, longitude: row.publicLongitude },
    distanceMeters: publicDistance(row.distance),
  };
}

@Injectable()
export class ListingSearch {
  constructor(
    @Inject(ListingSearchQuery) private readonly queries: ListingSearchQuery,
    @Inject(SearchCursor) private readonly cursors: SearchCursor,
    @Inject(MediaSearchProjection)
    private readonly media: MediaSearchProjection,
    @Inject(PartRecords) private readonly parts: PartRecords,
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}

  async search(query: SearchQuery) {
    const start = performance.now();
    const rows = await this.queries
      .page(query, this.cursors.decode(query))
      .getRawMany<SearchRow>();
    const hasNextPage = rows.length > query.limit;
    const selected = rows.slice(0, query.limit);
    const last = selected.at(-1);
    const items =
      query.type === 'VEHICLE'
        ? await Promise.all(
            selected.map((row) => this.vehicleItem(row as VehicleSearchRow)),
          )
        : await this.partItems(selected as PartSearchRow[]);
    this.observe('list', query, start, items.length);
    return {
      items,
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? this.cursors.encode(query, rowPosition(query, last))
            : null,
      },
    };
  }

  async markers(query: MapSearchQuery) {
    const start = performance.now();
    const rows = await this.queries
      .mapClusters(query)
      .getRawMany<MapClusterRow>();
    const truncated = rows.length > query.limit;
    const selected = rows.slice(0, query.limit);
    const singletonIds = selected
      .filter((row) => Number(row.count) === 1)
      .map((row) => row.listingId);
    const detailQuery = this.queries.mapDetails(query, singletonIds);
    const details = detailQuery
      ? await detailQuery.getRawMany<SearchRow>()
      : [];
    const detailsById = new Map(details.map((row) => [row.id, row]));
    const features = (
      await Promise.all(
        selected.map(async (row) => {
          const count = this.mapNumber(row.count);
          if (count > 1) return this.clusterFeature(query, row, count);
          const detail = detailsById.get(row.listingId);
          return detail ? this.listingFeature(detail) : null;
        }),
      )
    ).filter((feature) => feature !== null);
    const clusterCount = features.filter(
      (feature) => feature.kind === 'CLUSTER',
    ).length;
    this.observeMap(query, start, features.length, clusterCount, truncated);
    return { features, truncated, limit: query.limit };
  }

  async facets(query: SearchQuery) {
    const start = performance.now();
    const rows = await this.queries
      .facetQuery(query)
      .getRawMany<{ facet: string; value: string; count: number }>();
    const names =
      query.type === 'VEHICLE'
        ? (['make', 'bodyType', 'fuelType', 'transmission'] as const)
        : (['category', 'brand', 'condition'] as const);
    const facets: Record<string, { value: string; count: number }[]> =
      Object.fromEntries(names.map((name) => [name, []]));
    for (const row of rows.slice(0, 100))
      if (names.some((name) => name === row.facet))
        facets[row.facet]?.push({ value: row.value, count: row.count });
    this.observe('facets', query, start, rows.length);
    return {
      type: query.type,
      facets,
      truncated: rows.length > 100,
      semantics: 'after_all_filters' as const,
    };
  }

  private async common(row: CommonSearchRow) {
    return {
      id: row.id,
      title: row.title,
      price: { amountMinor: row.priceMinor, currency: row.currency },
      publishedAt: row.publishedAt,
      cover: await this.media.thumbnail(
        row.thumbnailKey,
        row.thumbnailWidth,
        row.thumbnailHeight,
      ),
      location: searchLocation(row),
    };
  }

  private async vehicleItem(row: VehicleSearchRow) {
    return {
      ...(await this.common(row)),
      type: 'VEHICLE' as const,
      vehicle: {
        make: { id: row.makeId, name: row.makeName },
        model: { id: row.modelId, name: row.modelName },
        generation: row.generationId
          ? { id: row.generationId, name: row.generationName }
          : null,
        year: row.year,
        mileageKm: row.mileageKm,
        bodyType: row.bodyType,
        fuelType: row.fuelType,
        transmission: row.transmission,
        driveType: row.driveType,
        condition: row.condition,
        color: row.color,
      },
    };
  }

  private async listingFeature(row: SearchRow) {
    const location = searchLocation(row);
    if (!location?.publicPoint) return null;
    const common = {
      kind: 'LISTING' as const,
      listingId: row.id,
      type: row.type,
      title: row.title,
      publicPoint: location.publicPoint,
      price: { amountMinor: row.priceMinor, currency: row.currency },
      cover: await this.media.thumbnail(
        row.thumbnailKey,
        row.thumbnailWidth,
        row.thumbnailHeight,
      ),
      location: {
        city: location.city,
        region: location.region,
        countryCode: location.countryCode,
        distanceMeters: location.distanceMeters,
      },
    };
    return row.type === 'VEHICLE'
      ? {
          ...common,
          type: 'VEHICLE' as const,
          vehicle: {
            make: row.makeName,
            model: row.modelName,
            year: row.year,
            mileageKm: row.mileageKm,
          },
        }
      : {
          ...common,
          type: 'PART' as const,
          part: {
            name: row.partName,
            category: row.partCategoryName,
            brand: row.partBrandName,
            condition: row.partCondition,
            fitment: { mode: row.fitmentMode, count: row.fitmentCount },
          },
        };
  }

  private clusterFeature(
    query: MapSearchQuery,
    row: MapClusterRow,
    count: number,
  ) {
    return {
      kind: 'CLUSTER' as const,
      clusterId: `${query.zoomBucket}:${row.bucketX}:${row.bucketY}`,
      center: {
        latitude: this.mapNumber(row.latitude),
        longitude: this.mapNumber(row.longitude),
      },
      count,
      bounds: {
        west: this.mapNumber(row.west),
        south: this.mapNumber(row.south),
        east: this.mapNumber(row.east),
        north: this.mapNumber(row.north),
      },
    };
  }

  private mapNumber(value: number | string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error('Invalid map projection');
    return parsed;
  }

  private async partItems(rows: PartSearchRow[]) {
    const records = new Map(
      (
        await this.parts.readMany(
          rows.map((row) => row.partId),
          this.database.source.manager,
          true,
        )
      ).map((part) => [part.id, part]),
    );
    return Promise.all(
      rows.map(async (row) => {
        const record = records.get(row.partId);
        if (!record) throw new Error('Missing part search projection');
        return {
          ...(await this.common(row)),
          type: 'PART' as const,
          part: {
            name: row.partName,
            category: {
              id: row.partCategoryId,
              name: row.partCategoryName,
              parentId: row.partCategoryParentId,
            },
            brand: row.partBrandId
              ? { id: row.partBrandId, name: row.partBrandName }
              : null,
            condition: row.partCondition,
            manufacturerPartNumber: row.manufacturerPartNumber,
            oemNumber: row.oemNumber,
            quantityAvailable: row.quantityAvailable,
            fitment: {
              mode: row.fitmentMode,
              count: row.fitmentCount,
              samples: record.fitments.slice(0, 3).map((fitment) => ({
                make: fitment.make,
                model: fitment.model,
                generation: fitment.generation,
                yearFrom: fitment.yearFrom,
                yearTo: fitment.yearTo,
              })),
            },
          },
        };
      }),
    );
  }

  private observe(
    operation: string,
    query: SearchQuery,
    start: number,
    count: number,
  ) {
    const durationMs = Math.round(performance.now() - start);
    this.logger.event(durationMs >= 500 ? 'warn' : 'info', 'Search completed', {
      operation: `search.${operation}`,
      listingType: query.type,
      durationMs,
      geoMode: query.spatial.mode,
      filterCount: Object.keys(query.filters).length,
      resultCount: count,
      sort: query.sort,
    });
  }

  private observeMap(
    query: MapSearchQuery,
    start: number,
    count: number,
    clusterCount: number,
    truncated: boolean,
  ) {
    const durationMs = Math.round(performance.now() - start);
    this.logger.event(durationMs >= 500 ? 'warn' : 'info', 'Search completed', {
      operation: 'search.map',
      listingType: query.search.type,
      durationMs,
      geoMode: query.search.spatial.mode,
      filterCount: Object.keys(query.search.filters).length,
      resultCount: count,
      sort: query.search.sort,
      zoomBucket: query.zoomBucket,
      clusterCount,
      truncated,
    });
  }
}
