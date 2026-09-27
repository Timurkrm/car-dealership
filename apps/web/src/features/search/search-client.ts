import { AuthApiError } from '../auth/auth-client';
import type { AuthClient } from '../auth/auth-client';
import { parseVariant } from '../media/media-client';
import type { Variant } from '../media/media-client';
import type { CatalogItem, Point } from '../listings/listing-types';
import { serializeSearchParameters } from './search-parameters';
import type { SearchParameters } from './search-parameters';

export type SearchListingType = 'VEHICLE' | 'PART';
interface SearchItemBase {
  id: string;
  title: string;
  price: { amountMinor: string; currency: string };
  publishedAt: string;
  cover: Variant;
  location: {
    city: string;
    region: string | null;
    countryCode: string;
    publicPoint: Point | null;
    distanceMeters: number | null;
  } | null;
}
export interface VehicleSearchItem extends SearchItemBase {
  type: 'VEHICLE';
  vehicle: {
    make: CatalogItem;
    model: CatalogItem;
    generation: CatalogItem | null;
    year: number;
    mileageKm: number;
    bodyType: string;
    fuelType: string;
    transmission: string;
    driveType: string;
    condition: string;
    color: string | null;
  };
}
export interface PartSearchItem extends SearchItemBase {
  type: 'PART';
  part: {
    name: string;
    category: CatalogItem & { parentId: string | null };
    brand: CatalogItem | null;
    condition: string;
    manufacturerPartNumber: string | null;
    oemNumber: string | null;
    quantityAvailable: number;
    fitment: {
      mode: 'UNIVERSAL' | 'VEHICLE_SPECIFIC';
      count: number;
      samples: {
        make: CatalogItem;
        model: CatalogItem;
        generation: CatalogItem | null;
        yearFrom: number | null;
        yearTo: number | null;
      }[];
    };
  };
}
export type SearchItem = VehicleSearchItem | PartSearchItem;
export interface SearchPage {
  items: SearchItem[];
  page: { hasNextPage: boolean; nextCursor: string | null };
}
export interface SearchFacets {
  type: SearchListingType;
  facets: Record<string, { value: string; count: number }[]>;
  truncated: boolean;
}
interface MapListingBase {
  kind: 'LISTING';
  listingId: string;
  title: string;
  publicPoint: Point;
  price: { amountMinor: string; currency: string };
  cover: Variant;
  location: {
    city: string;
    region: string | null;
    countryCode: string;
    distanceMeters: number | null;
  };
}
export interface VehicleMapFeature extends MapListingBase {
  type: 'VEHICLE';
  vehicle: { make: string; model: string; year: number; mileageKm: number };
}
export interface PartMapFeature extends MapListingBase {
  type: 'PART';
  part: {
    name: string;
    category: string;
    brand: string | null;
    condition: string;
    fitment: { mode: 'UNIVERSAL' | 'VEHICLE_SPECIFIC'; count: number };
  };
}
export interface ClusterMapFeature {
  kind: 'CLUSTER';
  clusterId: string;
  center: Point;
  count: number;
  bounds: { west: number; south: number; east: number; north: number };
}
export type MapFeature = VehicleMapFeature | PartMapFeature | ClusterMapFeature;
export interface MapResponse {
  features: MapFeature[];
  truncated: boolean;
  limit: number;
}
function invalid(): never {
  throw new AuthApiError(502, 'INVALID_API_RESPONSE');
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : invalid();
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}
function id(value: unknown): string {
  const result = text(value);
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    result,
  )
    ? result
    : invalid();
}
function integer(value: unknown, min: number, max: number): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : invalid();
}
function nullableInteger(
  value: unknown,
  min: number,
  max: number,
): number | null {
  return value === null ? null : integer(value, min, max);
}
function named(value: unknown): CatalogItem {
  const row = object(value);
  return { id: id(row.id), name: text(row.name) };
}
function point(value: unknown): Point {
  const row = object(value);
  if (
    typeof row.latitude !== 'number' ||
    !Number.isFinite(row.latitude) ||
    Math.abs(row.latitude) > 90 ||
    typeof row.longitude !== 'number' ||
    !Number.isFinite(row.longitude) ||
    Math.abs(row.longitude) > 180
  )
    return invalid();
  return { latitude: row.latitude, longitude: row.longitude };
}
function common(row: Record<string, unknown>): SearchItemBase {
  const price = object(row.price);
  const amountMinor = text(price.amountMinor);
  if (
    !/^[1-9]\d{0,18}$/.test(amountMinor) ||
    BigInt(amountMinor) > 9223372036854775807n
  )
    return invalid();
  const location = row.location === null ? null : object(row.location);
  const distance =
    location === null || location.distanceMeters === null
      ? null
      : integer(location.distanceMeters, 0, 21000000);
  if (distance !== null && distance % 1000 !== 0) return invalid();
  return {
    id: id(row.id),
    title: text(row.title),
    price: { amountMinor, currency: text(price.currency) },
    publishedAt: text(row.publishedAt),
    cover: parseVariant(row.cover),
    location:
      location === null
        ? null
        : {
            city: text(location.city),
            region: location.region === null ? null : text(location.region),
            countryCode: text(location.countryCode),
            publicPoint:
              location.publicPoint === null
                ? null
                : point(location.publicPoint),
            distanceMeters: distance,
          },
  };
}
function price(value: unknown) {
  const row = object(value);
  const amountMinor = text(row.amountMinor);
  if (!/^[1-9]\d{0,18}$/.test(amountMinor)) return invalid();
  return { amountMinor, currency: text(row.currency) };
}
function mapListing(row: Record<string, unknown>): MapListingBase {
  const location = object(row.location);
  const distance =
    location.distanceMeters === null
      ? null
      : integer(location.distanceMeters, 0, 21000000);
  if (distance !== null && distance % 1000 !== 0) return invalid();
  return {
    kind: 'LISTING',
    listingId: id(row.listingId),
    title: text(row.title),
    publicPoint: point(row.publicPoint),
    price: price(row.price),
    cover: parseVariant(row.cover),
    location: {
      city: text(location.city),
      region: location.region === null ? null : text(location.region),
      countryCode: text(location.countryCode),
      distanceMeters: distance,
    },
  };
}
function mapFeature(value: unknown): MapFeature {
  const row = object(value);
  if (row.kind === 'CLUSTER') {
    const bounds = object(row.bounds);
    const west = point({ latitude: 0, longitude: bounds.west }).longitude;
    const east = point({ latitude: 0, longitude: bounds.east }).longitude;
    const south = point({ latitude: bounds.south, longitude: 0 }).latitude;
    const north = point({ latitude: bounds.north, longitude: 0 }).latitude;
    if (south > north) return invalid();
    return {
      kind: 'CLUSTER',
      clusterId: text(row.clusterId),
      center: point(row.center),
      count: integer(row.count, 2, 2147483647),
      bounds: { west, south, east, north },
    };
  }
  if (row.kind !== 'LISTING') return invalid();
  const base = mapListing(row);
  if (row.type === 'VEHICLE') {
    const vehicle = object(row.vehicle);
    return {
      ...base,
      type: 'VEHICLE',
      vehicle: {
        make: text(vehicle.make),
        model: text(vehicle.model),
        year: integer(vehicle.year, 1886, 2100),
        mileageKm: integer(vehicle.mileageKm, 0, 2147483647),
      },
    };
  }
  if (row.type === 'PART') {
    const part = object(row.part);
    const fitment = object(part.fitment);
    if (fitment.mode !== 'UNIVERSAL' && fitment.mode !== 'VEHICLE_SPECIFIC')
      return invalid();
    return {
      ...base,
      type: 'PART',
      part: {
        name: text(part.name),
        category: text(part.category),
        brand: part.brand === null ? null : text(part.brand),
        condition: text(part.condition),
        fitment: {
          mode: fitment.mode,
          count: integer(fitment.count, 0, 50),
        },
      },
    };
  }
  return invalid();
}
export function parseMapResponse(value: unknown): MapResponse {
  const root = object(value);
  if (
    !Array.isArray(root.features) ||
    root.features.length > 500 ||
    typeof root.truncated !== 'boolean'
  )
    return invalid();
  const limit = integer(root.limit, 1, 500);
  if (root.features.length > limit) return invalid();
  return {
    features: root.features.map(mapFeature),
    truncated: root.truncated,
    limit,
  };
}
function vehicleItem(row: Record<string, unknown>): VehicleSearchItem {
  const vehicle = object(row.vehicle);
  return {
    ...common(row),
    type: 'VEHICLE',
    vehicle: {
      make: named(vehicle.make),
      model: named(vehicle.model),
      generation:
        vehicle.generation === null ? null : named(vehicle.generation),
      year: integer(vehicle.year, 1886, 2100),
      mileageKm: integer(vehicle.mileageKm, 0, 2147483647),
      bodyType: text(vehicle.bodyType),
      fuelType: text(vehicle.fuelType),
      transmission: text(vehicle.transmission),
      driveType: text(vehicle.driveType),
      condition: text(vehicle.condition),
      color: vehicle.color === null ? null : text(vehicle.color),
    },
  };
}
function partItem(row: Record<string, unknown>): PartSearchItem {
  const part = object(row.part);
  const category = object(part.category);
  const fitment = object(part.fitment);
  if (fitment.mode !== 'UNIVERSAL' && fitment.mode !== 'VEHICLE_SPECIFIC')
    return invalid();
  if (!Array.isArray(fitment.samples) || fitment.samples.length > 3)
    return invalid();
  return {
    ...common(row),
    type: 'PART',
    part: {
      name: text(part.name),
      category: {
        ...named(category),
        parentId: category.parentId === null ? null : id(category.parentId),
      },
      brand: part.brand === null ? null : named(part.brand),
      condition: text(part.condition),
      manufacturerPartNumber:
        part.manufacturerPartNumber === null
          ? null
          : text(part.manufacturerPartNumber),
      oemNumber: part.oemNumber === null ? null : text(part.oemNumber),
      quantityAvailable: integer(part.quantityAvailable, 1, 1000000),
      fitment: {
        mode: fitment.mode,
        count: integer(fitment.count, 0, 50),
        samples: fitment.samples.map((value) => {
          const sample = object(value);
          return {
            make: named(sample.make),
            model: named(sample.model),
            generation:
              sample.generation === null ? null : named(sample.generation),
            yearFrom: nullableInteger(sample.yearFrom, 1886, 2100),
            yearTo: nullableInteger(sample.yearTo, 1886, 2100),
          };
        }),
      },
    },
  };
}
export function parseSearchPage(value: unknown): SearchPage {
  const root = object(value);
  const page = object(root.page);
  if (
    !Array.isArray(root.items) ||
    root.items.length > 50 ||
    typeof page.hasNextPage !== 'boolean' ||
    (page.nextCursor !== null &&
      (typeof page.nextCursor !== 'string' || page.nextCursor.length > 2048)) ||
    page.hasNextPage !== (page.nextCursor !== null)
  )
    return invalid();
  const items = root.items.map((value) => {
    const row = object(value);
    if (row.type === 'VEHICLE') return vehicleItem(row);
    if (row.type === 'PART') return partItem(row);
    return invalid();
  });
  return {
    items,
    page: {
      hasNextPage: page.hasNextPage,
      nextCursor: page.nextCursor === null ? null : text(page.nextCursor),
    },
  };
}

export class SearchClient {
  constructor(private readonly client: AuthClient) {}
  async listings(
    type: SearchListingType,
    parameters: SearchParameters,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SearchPage> {
    const query = serializeSearchParameters(parameters);
    const response = await this.client.api(
      `listings?type=${type}${query ? '&' + query : ''}&limit=20${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
      { signal },
    );
    const result = parseSearchPage(await response.json());
    if (result.items.some((item) => item.type !== type)) return invalid();
    return result;
  }
  async facets(
    type: SearchListingType,
    parameters: SearchParameters,
    signal?: AbortSignal,
  ): Promise<SearchFacets> {
    const query = serializeSearchParameters(parameters);
    const response = await this.client.api(
      `search/listings/facets?type=${type}${query ? '&' + query : ''}`,
      { signal },
    );
    const root = object(await response.json());
    const facets = object(root.facets);
    if (
      root.type !== type ||
      root.semantics !== 'after_all_filters' ||
      typeof root.truncated !== 'boolean'
    )
      return invalid();
    const keys =
      type === 'VEHICLE'
        ? ['make', 'bodyType', 'fuelType', 'transmission']
        : ['category', 'brand', 'condition'];
    const result: SearchFacets = {
      type,
      facets: {},
      truncated: root.truncated,
    };
    let total = 0;
    for (const key of keys) {
      const values = facets[key];
      if (!Array.isArray(values) || values.length > 100) return invalid();
      total += values.length;
      result.facets[key] = values.map((value) => {
        const row = object(value);
        return {
          value: text(row.value),
          count: integer(row.count, 1, 2147483647),
        };
      });
    }
    return total <= 100 ? result : invalid();
  }
  async mapListings(
    type: SearchListingType,
    parameters: SearchParameters,
    viewport: string,
    zoom: number,
    signal?: AbortSignal,
  ): Promise<MapResponse> {
    const query = new URLSearchParams(serializeSearchParameters(parameters));
    query.set('type', type);
    query.set('viewport', viewport);
    query.set('zoom', zoom.toFixed(2));
    const response = await this.client.api(
      `search/listings/map?${query.toString()}`,
      { signal },
    );
    const result = parseMapResponse(await response.json());
    if (
      result.features.some(
        (feature) => feature.kind === 'LISTING' && feature.type !== type,
      )
    )
      return invalid();
    return result;
  }
}
