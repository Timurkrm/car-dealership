import { Inject, Injectable } from '@nestjs/common';
import type { SelectQueryBuilder } from 'typeorm';
import type { Listing } from '../../listings';
import {
  VehicleSearchProjection,
  VEHICLE_SEARCH_COLUMNS,
} from '../../vehicles';
import { PartSearchProjection, PART_SEARCH_COLUMNS } from '../../parts';
import type { SearchQuery, SearchListingType } from '../domain/search-query';

export interface FacetColumn {
  name: string;
  column: string;
}
export interface SearchSubtypeStrategy {
  readonly type: SearchListingType;
  attach(query: SelectQueryBuilder<Listing>, search: SearchQuery): void;
  sortColumn(search: SearchQuery): string | null;
  facetColumns(): readonly FacetColumn[];
}

@Injectable()
export class VehicleSearchStrategy implements SearchSubtypeStrategy {
  readonly type = 'VEHICLE' as const;
  constructor(
    @Inject(VehicleSearchProjection)
    private readonly projection: VehicleSearchProjection,
  ) {}
  attach(query: SelectQueryBuilder<Listing>, search: SearchQuery): void {
    if (search.type !== this.type) throw new Error('Vehicle strategy mismatch');
    this.projection.attach(query, search.filters);
  }
  sortColumn(search: SearchQuery): string | null {
    if (search.sort === 'mileage_asc') return VEHICLE_SEARCH_COLUMNS.mileage;
    if (search.sort === 'year_desc') return VEHICLE_SEARCH_COLUMNS.year;
    return null;
  }
  facetColumns(): readonly FacetColumn[] {
    return [
      { name: 'make', column: VEHICLE_SEARCH_COLUMNS.make },
      { name: 'bodyType', column: VEHICLE_SEARCH_COLUMNS.bodyType },
      { name: 'fuelType', column: VEHICLE_SEARCH_COLUMNS.fuelType },
      { name: 'transmission', column: VEHICLE_SEARCH_COLUMNS.transmission },
    ];
  }
}

@Injectable()
export class PartSearchStrategy implements SearchSubtypeStrategy {
  readonly type = 'PART' as const;
  constructor(
    @Inject(PartSearchProjection)
    private readonly projection: PartSearchProjection,
  ) {}
  attach(query: SelectQueryBuilder<Listing>, search: SearchQuery): void {
    if (search.type !== this.type) throw new Error('Part strategy mismatch');
    this.projection.attach(query, search.filters);
  }
  sortColumn(): string | null {
    return null;
  }
  facetColumns(): readonly FacetColumn[] {
    return [
      { name: 'category', column: PART_SEARCH_COLUMNS.category },
      { name: 'brand', column: PART_SEARCH_COLUMNS.brand },
      { name: 'condition', column: PART_SEARCH_COLUMNS.condition },
    ];
  }
}

@Injectable()
export class SearchSubtypeStrategies {
  private readonly values: ReadonlyMap<
    SearchListingType,
    SearchSubtypeStrategy
  >;
  constructor(
    @Inject(VehicleSearchStrategy) vehicle: VehicleSearchStrategy,
    @Inject(PartSearchStrategy) part: PartSearchStrategy,
  ) {
    this.values = new Map<SearchListingType, SearchSubtypeStrategy>([
      [vehicle.type, vehicle],
      [part.type, part],
    ]);
  }
  for(search: SearchQuery): SearchSubtypeStrategy {
    const value = this.values.get(search.type);
    if (!value) throw new Error('Missing search subtype strategy');
    return value;
  }
}
