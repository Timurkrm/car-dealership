import type { SpatialSearch } from '../../geo';
import { parseSpatialSearch } from '../../geo';
import {
  parseSearchQuery,
  searchError,
  type SearchQuery,
} from './search-query';

export const MAP_FEATURE_LIMIT = 500;
export const MAP_DEFAULT_ZOOM = 10;
export const MAP_MIN_ZOOM = 0;
export const MAP_MAX_ZOOM = 22;
export const MAP_GRID_SIZE_PX = 64;

export type MapViewport = Extract<SpatialSearch, { mode: 'bbox' }>;

export interface MapSearchQuery {
  search: SearchQuery;
  viewport: MapViewport;
  zoom: number;
  zoomBucket: number;
  limit: number;
  legacyBboxAlias: boolean;
}

function record(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return searchError('SEARCH_INVALID_FILTER', 'query');
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.length > 2048)
      return searchError('SEARCH_INVALID_FILTER', key);
    values[key] = value;
  }
  return values;
}

function viewport(value: string): MapViewport {
  let parsed: SpatialSearch;
  try {
    parsed = parseSpatialSearch({ bbox: value });
  } catch {
    return searchError('MAP_INVALID_VIEWPORT', 'viewport');
  }
  if (
    parsed.mode !== 'bbox' ||
    parsed.west === parsed.east ||
    parsed.south >= parsed.north
  )
    return searchError('MAP_INVALID_VIEWPORT', 'viewport');
  return parsed;
}

function zoom(value: string | undefined): number {
  if (
    value !== undefined &&
    (!/^(?:\d|1\d|2[0-2])(?:\.\d{1,2})?$/.test(value) ||
      Number(value) < MAP_MIN_ZOOM ||
      Number(value) > MAP_MAX_ZOOM)
  )
    return searchError('MAP_INVALID_ZOOM', 'zoom');
  return value === undefined ? MAP_DEFAULT_ZOOM : Number(value);
}

function limit(value: string | undefined): number {
  if (
    value !== undefined &&
    (!/^[1-9]\d{0,2}$/.test(value) || Number(value) > MAP_FEATURE_LIMIT)
  )
    return searchError('SEARCH_INVALID_FILTER', 'limit');
  return value === undefined ? MAP_FEATURE_LIMIT : Number(value);
}

/**
 * `viewport` controls the map projection. Search geography remains in the
 * ordinary bbox/origin fields, so panning never silently changes the result
 * set. A lone legacy bbox is treated as viewport for existing clients.
 */
export function parseMapQuery(input: unknown): MapSearchQuery {
  const values = record(input);
  if (values.cursor !== undefined)
    return searchError('SEARCH_INVALID_CURSOR', 'cursor');

  const hasOrigin =
    values.lat !== undefined ||
    values.lng !== undefined ||
    values.radiusMeters !== undefined;
  const legacyBboxAlias = values.viewport === undefined;
  if (legacyBboxAlias && (values.bbox === undefined || hasOrigin))
    return searchError('MAP_INVALID_VIEWPORT', 'viewport');

  const mapViewport = viewport(
    legacyBboxAlias ? (values.bbox as string) : (values.viewport as string),
  );
  const mapZoom = zoom(values.zoom);
  const mapLimit = limit(values.limit);

  const searchValues = { ...values };
  delete searchValues.viewport;
  delete searchValues.zoom;
  delete searchValues.limit;
  if (legacyBboxAlias) delete searchValues.bbox;

  return {
    search: parseSearchQuery(searchValues, 'facets'),
    viewport: mapViewport,
    zoom: mapZoom,
    zoomBucket: Math.floor(mapZoom),
    limit: mapLimit,
    legacyBboxAlias,
  };
}

/** A 64 CSS-pixel cell at the selected integer Web Mercator zoom. */
export function mapGridCellMeters(zoomBucket: number): number {
  const worldMeters = 40075016.68557849;
  const tilePixels = 512;
  return worldMeters / 2 ** zoomBucket / (tilePixels / MAP_GRID_SIZE_PX);
}
