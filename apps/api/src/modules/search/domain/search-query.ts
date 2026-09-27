import { createHash } from 'node:crypto';
import { ApiException } from '../../../platform/http/api-error';
import { parseSpatialSearch } from '../../geo';
import type { SpatialSearch } from '../../geo';
import {
  BODY_TYPES,
  FUEL_TYPES,
  TRANSMISSIONS,
  DRIVE_TYPES,
  VEHICLE_CONDITIONS,
  VEHICLE_COLORS,
} from '../../vehicles';
import type { VehicleSearchFilters } from '../../vehicles';
import {
  FITMENT_MODES,
  PART_CONDITIONS,
  normalizePartNumber,
} from '../../parts';
import type { FitmentMode, PartCondition } from '../../parts';
import { SUPPORTED_CURRENCIES } from '../../listings';

export const SEARCH_SCHEMA_VERSION = 2;
export const LISTING_TYPES = ['VEHICLE', 'PART'] as const;
export type SearchListingType = (typeof LISTING_TYPES)[number];
export const SEARCH_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'mileage_asc',
  'year_desc',
  'distance',
] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export interface CommonSearchFilters {
  currency?: string;
  priceFromMinor?: string;
  priceToMinor?: string;
}
export type VehicleListingSearchFilters = CommonSearchFilters &
  VehicleSearchFilters;
export interface PartListingSearchFilters extends CommonSearchFilters {
  categoryId?: string;
  includeSubcategories: boolean;
  brandId?: string;
  condition?: PartCondition[];
  oemNumber?: string;
  manufacturerPartNumber?: string;
  partNumber?: string;
  compatibleMakeId?: string;
  compatibleModelId?: string;
  compatibleGenerationId?: string;
  compatibleYear?: number;
  fitmentMode?: FitmentMode[];
  includeUniversal: boolean;
}
interface SearchQueryBase {
  schemaVersion: 2;
  spatial: SpatialSearch;
  sort: SearchSort;
  limit: number;
  cursor?: string;
}
export type SearchQuery =
  | (SearchQueryBase & {
      type: 'VEHICLE';
      filters: VehicleListingSearchFilters;
    })
  | (SearchQueryBase & {
      type: 'PART';
      filters: PartListingSearchFilters;
    });
export type SearchFilters = SearchQuery['filters'];

const VEHICLE_CATEGORIES = {
  bodyType: BODY_TYPES,
  fuelType: FUEL_TYPES,
  transmission: TRANSMISSIONS,
  driveType: DRIVE_TYPES,
  condition: VEHICLE_CONDITIONS,
  color: VEHICLE_COLORS,
};
const COMMON_PARAMETERS = [
  'type',
  'priceFromMinor',
  'priceToMinor',
  'currency',
  'sort',
  'bbox',
  'lat',
  'lng',
  'radiusMeters',
  'limit',
  'cursor',
] as const;
const VEHICLE_PARAMETERS = [
  'makeId',
  'modelId',
  'generationId',
  'yearFrom',
  'yearTo',
  'mileageFrom',
  'mileageTo',
  ...Object.keys(VEHICLE_CATEGORIES),
] as const;
const PART_PARAMETERS = [
  'categoryId',
  'includeSubcategories',
  'brandId',
  'condition',
  'oemNumber',
  'manufacturerPartNumber',
  'partNumber',
  'compatibleMakeId',
  'compatibleModelId',
  'compatibleGenerationId',
  'compatibleYear',
  'fitmentMode',
  'includeUniversal',
] as const;
export const SEARCH_PARAMETERS = [
  ...COMMON_PARAMETERS,
  ...VEHICLE_PARAMETERS,
  ...PART_PARAMETERS,
] as const;

export function searchError(code: string, field: string): never {
  throw new ApiException(
    400,
    code === 'SEARCH_INVALID_RANGE' ? 'VALIDATION_ERROR' : code,
    'Invalid search parameters',
    [{ field, rules: [code] }],
  );
}
function uuid(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    return searchError('SEARCH_INVALID_FILTER', field);
  return value.toLowerCase();
}
function integer(
  value: string | undefined,
  field: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    !/^(0|[1-9]\d{0,9})$/.test(value) ||
    Number(value) < min ||
    Number(value) > max
  )
    return searchError('SEARCH_INVALID_FILTER', field);
  return Number(value);
}
function booleanValue(
  value: string | undefined,
  field: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false')
    return searchError('SEARCH_INVALID_FILTER', field);
  return value === 'true';
}
function multiValues<T extends string>(
  value: string | undefined,
  field: string,
  allowed: readonly T[],
): T[] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(',');
  if (
    parts.length === 0 ||
    parts.length > 8 ||
    new Set(parts).size !== parts.length ||
    !parts.every((part): part is T => allowed.some((item) => item === part))
  )
    return searchError('SEARCH_INVALID_FILTER', field);
  return parts.sort();
}
function partNumber(value: string | undefined, field: string) {
  if (value === undefined) return undefined;
  try {
    return normalizePartNumber(value) ?? undefined;
  } catch {
    return searchError('SEARCH_INVALID_FILTER', field);
  }
}
function commonFilters(values: Record<string, string>): CommonSearchFilters {
  const filters: CommonSearchFilters = {};
  for (const key of ['priceFromMinor', 'priceToMinor'] as const) {
    const value = values[key];
    if (value === undefined) continue;
    if (
      !/^(0|[1-9]\d{0,18})$/.test(value) ||
      BigInt(value) > 9223372036854775807n
    )
      return searchError('SEARCH_INVALID_FILTER', key);
    filters[key] = value;
  }
  if (values.currency !== undefined) {
    if (!SUPPORTED_CURRENCIES.some((value) => value === values.currency))
      return searchError('SEARCH_INVALID_FILTER', 'currency');
    filters.currency = values.currency;
  }
  if (
    filters.priceFromMinor !== undefined &&
    filters.priceToMinor !== undefined &&
    BigInt(filters.priceFromMinor) > BigInt(filters.priceToMinor)
  )
    return searchError('SEARCH_INVALID_RANGE', 'priceFromMinor');
  if (
    (filters.priceFromMinor !== undefined ||
      filters.priceToMinor !== undefined) &&
    !filters.currency
  )
    return searchError('SEARCH_INVALID_FILTER', 'currency');
  return filters;
}
function vehicleFilters(
  input: Record<string, string>,
): VehicleListingSearchFilters {
  const filters: VehicleListingSearchFilters = commonFilters(input);
  for (const key of ['makeId', 'modelId', 'generationId'] as const) {
    const value = uuid(input[key], key);
    if (value) filters[key] = value;
  }
  for (const key of [
    'yearFrom',
    'yearTo',
    'mileageFrom',
    'mileageTo',
  ] as const) {
    const year = key.startsWith('year');
    const value = integer(
      input[key],
      key,
      year ? 1886 : 0,
      year ? 2100 : 2147483647,
    );
    if (value !== undefined) filters[key] = value;
  }
  for (const [from, to] of [
    ['yearFrom', 'yearTo'],
    ['mileageFrom', 'mileageTo'],
  ] as const)
    if (
      filters[from] !== undefined &&
      filters[to] !== undefined &&
      filters[from] > filters[to]
    )
      return searchError('SEARCH_INVALID_RANGE', from);
  for (const key of Object.keys(
    VEHICLE_CATEGORIES,
  ) as (keyof typeof VEHICLE_CATEGORIES)[]) {
    const selected = multiValues(input[key], key, VEHICLE_CATEGORIES[key]);
    if (selected) filters[key] = selected;
  }
  return filters;
}
function partFilters(input: Record<string, string>): PartListingSearchFilters {
  const filters: PartListingSearchFilters = {
    ...commonFilters(input),
    includeSubcategories: booleanValue(
      input.includeSubcategories,
      'includeSubcategories',
      true,
    ),
    includeUniversal: booleanValue(
      input.includeUniversal,
      'includeUniversal',
      true,
    ),
  };
  for (const key of [
    'categoryId',
    'brandId',
    'compatibleMakeId',
    'compatibleModelId',
    'compatibleGenerationId',
  ] as const) {
    const value = uuid(input[key], key);
    if (value) filters[key] = value;
  }
  if (filters.compatibleGenerationId && !filters.compatibleModelId)
    return searchError('SEARCH_INVALID_FILTER', 'compatibleModelId');
  const compatibleYear = integer(
    input.compatibleYear,
    'compatibleYear',
    1886,
    2100,
  );
  if (compatibleYear !== undefined) filters.compatibleYear = compatibleYear;
  const condition = multiValues(input.condition, 'condition', PART_CONDITIONS);
  if (condition) filters.condition = condition;
  const fitmentMode = multiValues(
    input.fitmentMode,
    'fitmentMode',
    FITMENT_MODES,
  );
  if (fitmentMode) filters.fitmentMode = fitmentMode;
  for (const key of [
    'oemNumber',
    'manufacturerPartNumber',
    'partNumber',
  ] as const) {
    const value = partNumber(input[key], key);
    if (value) filters[key] = value;
  }
  return filters;
}

export function parseSearchQuery(
  input: unknown,
  mode: 'list' | 'map' | 'facets' = 'list',
  maximumRadius = 250000,
): SearchQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return searchError('SEARCH_INVALID_FILTER', 'query');
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      !SEARCH_PARAMETERS.some((parameter) => parameter === key) ||
      typeof value !== 'string' ||
      value.length > (key === 'cursor' ? 2048 : 256)
    )
      return searchError('SEARCH_INVALID_FILTER', key);
    values[key] = value;
  }
  const rawType = values.type ?? 'VEHICLE';
  if (!LISTING_TYPES.some((value) => value === rawType))
    return searchError('SEARCH_INVALID_FILTER', 'type');
  const type = rawType as SearchListingType;
  const supported = new Set<string>([
    ...COMMON_PARAMETERS,
    ...(type === 'VEHICLE' ? VEHICLE_PARAMETERS : PART_PARAMETERS),
  ]);
  for (const key of Object.keys(values))
    if (!supported.has(key))
      return searchError('SEARCH_FILTER_NOT_SUPPORTED', key);

  const filters =
    type === 'VEHICLE' ? vehicleFilters(values) : partFilters(values);
  const sort = SEARCH_SORTS.find(
    (value) => value === (values.sort ?? 'newest'),
  );
  if (!sort) return searchError('SEARCH_INVALID_SORT', 'sort');
  if (type === 'PART' && (sort === 'mileage_asc' || sort === 'year_desc'))
    return searchError('SEARCH_SORT_NOT_SUPPORTED', 'sort');
  if (sort.startsWith('price_') && !filters.currency)
    return searchError('SEARCH_INVALID_FILTER', 'currency');
  const spatial = parseSpatialSearch(values, maximumRadius);
  if (sort === 'distance' && spatial.mode !== 'origin')
    return searchError('SEARCH_LOCATION_REQUIRED', 'sort');
  if (mode === 'map' && spatial.mode !== 'bbox')
    return searchError('GEO_INVALID_BBOX', 'bbox');
  const limit = values.limit ?? (mode === 'map' ? '200' : '20');
  if (
    !/^[1-9]\d{0,2}$/.test(limit) ||
    Number(limit) > (mode === 'map' ? 500 : 50)
  )
    return searchError('SEARCH_INVALID_FILTER', 'limit');
  if (mode !== 'list' && values.cursor !== undefined)
    return searchError('SEARCH_INVALID_CURSOR', 'cursor');
  const common = {
    schemaVersion: SEARCH_SCHEMA_VERSION,
    spatial,
    sort,
    limit: Number(limit),
    ...(values.cursor !== undefined ? { cursor: values.cursor } : {}),
  } as const;
  return type === 'VEHICLE'
    ? {
        ...common,
        type,
        filters: filters as VehicleListingSearchFilters,
      }
    : { ...common, type, filters: filters as PartListingSearchFilters };
}

/** Serializable canonical filter model for cursor binding and future SavedSearch v2 records. */
export function canonicalSearch(query: SearchQuery): string {
  const entries = Object.entries(query.filters)
    .map(
      ([key, value]) =>
        [key, Array.isArray(value) ? [...value].sort() : value] as const,
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({
    schemaVersion: query.schemaVersion,
    type: query.type,
    filters: Object.fromEntries(entries),
    spatial: Object.fromEntries(
      Object.entries(query.spatial).sort(([a], [b]) => a.localeCompare(b)),
    ),
    sort: query.sort,
  });
}
export function searchFingerprint(query: SearchQuery): string {
  return createHash('sha256').update(canonicalSearch(query)).digest('hex');
}

export interface CanonicalSavedSearch {
  schemaVersion: typeof SEARCH_SCHEMA_VERSION;
  type: SearchListingType;
  filters: Record<string, string>;
  fingerprint: string;
  query: SearchQuery;
}

function serializedFilters(query: SearchQuery): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(query.filters)) {
    if (value === undefined) continue;
    values[key] = Array.isArray(value)
      ? [...value].sort().join(',')
      : String(value);
  }
  if (query.spatial.mode === 'bbox')
    values.bbox = [
      query.spatial.west,
      query.spatial.south,
      query.spatial.east,
      query.spatial.north,
    ].join(',');
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}

/** Canonical persistence model: no cursor, limit, sort, camera or private origin. */
export function parseSavedSearchFilters(
  type: SearchListingType,
  input: unknown,
): CanonicalSavedSearch {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return searchError('SAVED_SEARCH_INVALID_FILTERS', 'filters');
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string')
      return searchError('SAVED_SEARCH_INVALID_FILTERS', key);
    if (['lat', 'lng', 'radiusMeters'].includes(key))
      throw new ApiException(
        400,
        'SAVED_SEARCH_LOCATION_NOT_SAVABLE',
        'Precise location searches cannot be saved',
      );
    if (['cursor', 'limit', 'sort', 'type'].includes(key))
      return searchError('SAVED_SEARCH_INVALID_FILTERS', key);
    raw[key] = value;
  }
  const query = parseSearchQuery({ type, ...raw, sort: 'newest' });
  if (query.spatial.mode === 'origin')
    throw new ApiException(
      400,
      'SAVED_SEARCH_LOCATION_NOT_SAVABLE',
      'Precise location searches cannot be saved',
    );
  const filters = serializedFilters(query);
  const canonical = JSON.stringify({
    schemaVersion: SEARCH_SCHEMA_VERSION,
    type,
    filters,
  });
  return {
    schemaVersion: SEARCH_SCHEMA_VERSION,
    type,
    filters,
    fingerprint: createHash('sha256').update(canonical).digest('hex'),
    query,
  };
}

export function hasMeaningfulSavedSearchFilter(
  filters: Record<string, string>,
): boolean {
  return Object.keys(filters).some(
    (key) => !['includeSubcategories', 'includeUniversal'].includes(key),
  );
}
