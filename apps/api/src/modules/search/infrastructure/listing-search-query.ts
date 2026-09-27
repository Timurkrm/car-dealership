import { Inject, Injectable } from '@nestjs/common';
import {
  ListingSearchProjection,
  LISTING_SEARCH_COLUMNS,
} from '../../listings';
import { VEHICLE_SEARCH_COLUMNS } from '../../vehicles';
import { SpatialSearchProjection, GEOGRAPHY_DISTANCE } from '../../geo';
import { MediaSearchProjection } from '../../media';
import type { SearchQuery } from '../domain/search-query';
import { mapGridCellMeters, type MapSearchQuery } from '../domain/map-query';
import type { SearchPosition } from '../domain/search-cursor';
import { SearchSubtypeStrategies } from './search-subtype-strategy';

export interface CommonSearchRow {
  id: string;
  type: 'VEHICLE' | 'PART';
  title: string;
  priceMinor: string;
  currency: string;
  publishedAt: string;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  publicLatitude: number | null;
  publicLongitude: number | null;
  distance: number | null;
  thumbnailKey: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
}
export interface VehicleSearchRow extends CommonSearchRow {
  type: 'VEHICLE';
  makeId: string;
  makeName: string;
  modelId: string;
  modelName: string;
  generationId: string | null;
  generationName: string | null;
  year: number;
  mileageKm: number;
  bodyType: string;
  fuelType: string;
  transmission: string;
  driveType: string;
  condition: string;
  color: string | null;
}
export interface PartSearchRow extends CommonSearchRow {
  type: 'PART';
  partId: string;
  partName: string;
  partCategoryId: string;
  partCategoryName: string;
  partCategoryParentId: string | null;
  partBrandId: string | null;
  partBrandName: string | null;
  partCondition: string;
  manufacturerPartNumber: string | null;
  oemNumber: string | null;
  fitmentMode: string;
  fitmentCount: number;
  quantityAvailable: number;
}
export type SearchRow = VehicleSearchRow | PartSearchRow;
export type MatchingSearchRow = SearchRow & {
  sellerId: string;
  exactLatitude: number | null;
  exactLongitude: number | null;
};

export interface MapClusterRow {
  bucketX: string;
  bucketY: string;
  count: number;
  listingId: string;
  latitude: number;
  longitude: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

export function sortDefinition(query: SearchQuery): {
  column: string;
  direction: 'ASC' | 'DESC';
} {
  switch (query.sort) {
    case 'newest':
      return { column: LISTING_SEARCH_COLUMNS.published, direction: 'DESC' };
    case 'price_asc':
      return { column: LISTING_SEARCH_COLUMNS.price, direction: 'ASC' };
    case 'price_desc':
      return { column: LISTING_SEARCH_COLUMNS.price, direction: 'DESC' };
    case 'mileage_asc':
      return { column: VEHICLE_SEARCH_COLUMNS.mileage, direction: 'ASC' };
    case 'year_desc':
      return { column: VEHICLE_SEARCH_COLUMNS.year, direction: 'DESC' };
    case 'distance':
      return { column: `(${GEOGRAPHY_DISTANCE})`, direction: 'ASC' };
  }
}
export function rowPosition(
  query: SearchQuery,
  row: SearchRow,
): SearchPosition {
  const value =
    query.sort === 'newest'
      ? row.publishedAt
      : query.sort.startsWith('price')
        ? row.priceMinor
        : query.sort === 'year_desc'
          ? String((row as VehicleSearchRow).year)
          : query.sort === 'mileage_asc'
            ? String((row as VehicleSearchRow).mileageKm)
            : String(row.distance);
  return { id: row.id, publishedAt: row.publishedAt, value };
}

@Injectable()
export class ListingSearchQuery {
  constructor(
    @Inject(ListingSearchProjection)
    private readonly listings: ListingSearchProjection,
    @Inject(SearchSubtypeStrategies)
    private readonly strategies: SearchSubtypeStrategies,
    @Inject(SpatialSearchProjection)
    private readonly geo: SpatialSearchProjection,
    @Inject(MediaSearchProjection)
    private readonly media: MediaSearchProjection,
  ) {}
  filtered(query: SearchQuery, markers = false) {
    const builder = this.listings.published(query.type);
    this.listings.filter(builder, query.filters);
    this.strategies.for(query).attach(builder, query);
    this.geo.attach(builder, query.spatial, markers, query.type === 'PART');
    this.media.attach(builder);
    return builder;
  }
  /** Internal publication snapshot. Exact coordinates are selected only for matching saved areas. */
  matchingSnapshot(query: SearchQuery, listingId: string) {
    return this.filtered(query)
      .addSelect('listing.sellerId', 'sellerId')
      .addSelect('ST_Y(location.point)', 'exactLatitude')
      .addSelect('ST_X(location.point)', 'exactLongitude')
      .andWhere('listing.id = :matchingListingId', {
        matchingListingId: listingId,
      })
      .limit(1);
  }
  private mapFiltered(query: MapSearchQuery, details: boolean) {
    const builder = this.listings.published(query.search.type);
    this.listings.filter(builder, query.search.filters);
    this.strategies.for(query.search).attach(builder, query.search);
    this.geo.attach(
      builder,
      query.search.spatial,
      false,
      query.search.type === 'PART',
    );
    builder.andWhere('location.publicPoint IS NOT NULL');
    this.geo.searchByPublicViewport(builder, query.viewport);
    if (details) this.media.attach(builder);
    else this.media.eligible(builder);
    return builder;
  }
  mapClusters(query: MapSearchQuery) {
    const base = this.mapFiltered(query, false);
    const clampedPoint =
      'ST_SetSRID(ST_MakePoint(ST_X(location.publicPoint), LEAST(85.05112878, GREATEST(-85.05112878, ST_Y(location.publicPoint)))), 4326)';
    base
      .select('listing.id', 'listingId')
      .addSelect('ST_X(location.publicPoint)', 'longitude')
      .addSelect('ST_Y(location.publicPoint)', 'latitude')
      .addSelect(`ST_X(ST_Transform(${clampedPoint}, 3857))`, 'mercatorX')
      .addSelect(`ST_Y(ST_Transform(${clampedPoint}, 3857))`, 'mercatorY');

    const halfWorld = 20037508.342789244;
    const bucketX = 'floor((eligible."mercatorX" + :halfWorld) / :cellMeters)';
    const bucketY = 'floor((eligible."mercatorY" + :halfWorld) / :cellMeters)';
    const center =
      'ST_Transform(ST_SetSRID(ST_MakePoint(AVG(eligible."mercatorX"), AVG(eligible."mercatorY")), 3857), 4326)';
    return base.connection
      .createQueryBuilder()
      .select(bucketX, 'bucketX')
      .addSelect(bucketY, 'bucketY')
      .addSelect('COUNT(*)::integer', 'count')
      .addSelect('MIN(eligible."listingId"::text)', 'listingId')
      .addSelect(`ST_Y(${center})`, 'latitude')
      .addSelect(`ST_X(${center})`, 'longitude')
      .addSelect('MIN(eligible.longitude)', 'west')
      .addSelect('MIN(eligible.latitude)', 'south')
      .addSelect('MAX(eligible.longitude)', 'east')
      .addSelect('MAX(eligible.latitude)', 'north')
      .from(`(${base.getQuery()})`, 'eligible')
      .setParameters({
        ...base.getParameters(),
        halfWorld,
        cellMeters: mapGridCellMeters(query.zoomBucket),
      })
      .groupBy(bucketX)
      .addGroupBy(bucketY)
      .orderBy('"bucketY"', 'DESC')
      .addOrderBy('"bucketX"', 'ASC')
      .limit(query.limit + 1);
  }
  mapDetails(query: MapSearchQuery, listingIds: readonly string[]) {
    if (listingIds.length === 0) return null;
    return this.mapFiltered(query, true)
      .andWhere('listing.id IN (:...mapListingIds)', {
        mapListingIds: listingIds,
      })
      .orderBy('listing.id', 'ASC');
  }
  page(
    query: SearchQuery,
    position: SearchPosition | null = null,
    markers = false,
  ) {
    const builder = this.filtered(query, markers);
    const { column, direction } = sortDefinition(query);
    const published = LISTING_SEARCH_COLUMNS.published;
    const id = LISTING_SEARCH_COLUMNS.id;
    if (position) {
      const comparison = direction === 'ASC' ? '>' : '<';
      builder.andWhere(
        `(${column} ${comparison} :cursorValue OR (${column} = :cursorValue AND (${published} < :cursorPublished OR (${published} = :cursorPublished AND ${id} < :cursorId))))`,
        {
          cursorValue: position.value,
          cursorPublished: position.publishedAt,
          cursorId: position.id,
        },
      );
    }
    builder.orderBy(column, direction);
    if (query.sort !== 'newest') builder.addOrderBy(published, 'DESC');
    return builder.addOrderBy(id, 'DESC').limit(query.limit + 1);
  }
  facetQuery(query: SearchQuery) {
    const builder = this.filtered(query);
    const columns = this.strategies.for(query).facetColumns();
    const facetCase = columns
      .map(({ name, column }) => `WHEN GROUPING(${column}) = 0 THEN '${name}'`)
      .join(' ');
    const valueCase = columns
      .map(({ column }) => `WHEN GROUPING(${column}) = 0 THEN ${column}::text`)
      .join(' ');
    const value = `CASE ${valueCase} END`;
    return builder
      .select(`CASE ${facetCase} END`, 'facet')
      .addSelect(value, 'value')
      .addSelect('COUNT(*)::integer', 'count')
      .groupBy(
        `GROUPING SETS (${columns.map(({ column }) => `(${column})`).join(', ')})`,
      )
      .having(`${value} IS NOT NULL`)
      .orderBy('"count"', 'DESC')
      .addOrderBy('"facet"', 'ASC')
      .addOrderBy('"value"', 'ASC')
      .limit(101);
  }
}
