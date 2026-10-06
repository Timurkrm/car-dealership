import type { SearchParameters } from '../search/search-parameters';
import { serializeSearchParameters } from '../search/search-parameters';

export type MarketplaceView = 'list' | 'split' | 'map';
export interface MapCamera {
  latitude: number;
  longitude: number;
  zoom: number;
}
export interface MapUrlState {
  view: MarketplaceView;
  camera: MapCamera | null;
}
export const MAP_URL_KEYS = ['view', 'mapLat', 'mapLng', 'mapZoom'] as const;

function finite(value: string | null, max: number, decimals: number) {
  if (
    value === null ||
    !new RegExp(`^-?\\d{1,3}(?:\\.\\d{1,${decimals}})?$`).test(value)
  )
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= max ? parsed : null;
}

export function searchOnlyParameters(input: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams(input);
  for (const key of MAP_URL_KEYS) result.delete(key);
  return result;
}

export function parseMapUrlState(input: URLSearchParams): MapUrlState {
  const rawView = input.get('view');
  const view: MarketplaceView =
    rawView === 'list' || rawView === 'map' || rawView === 'split'
      ? rawView
      : 'split';
  const latitude = finite(input.get('mapLat'), 90, 4);
  const longitude = finite(input.get('mapLng'), 180, 4);
  const zoom = finite(input.get('mapZoom'), 22, 2);
  return {
    view,
    camera:
      latitude !== null && longitude !== null && zoom !== null && zoom >= 0
        ? { latitude, longitude, zoom }
        : null,
  };
}

export function catalogUrl(
  path: '/cars' | '/parts',
  filters: SearchParameters,
  state: MapUrlState,
  includeCamera: boolean,
): string {
  const query = new URLSearchParams(serializeSearchParameters(filters));
  if (state.view !== 'split') query.set('view', state.view);
  if (includeCamera && state.camera) {
    query.set('mapLat', state.camera.latitude.toFixed(4));
    query.set('mapLng', state.camera.longitude.toFixed(4));
    query.set('mapZoom', state.camera.zoom.toFixed(2));
  }
  const serialized = query.toString();
  return path + (serialized ? '?' + serialized : '');
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundsParameter(bounds: MapBounds): string {
  return [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((value) => String(Number(value.toFixed(6))))
    .join(',');
}

export function searchInArea(
  filters: SearchParameters,
  bounds: MapBounds,
): SearchParameters {
  const next: SearchParameters = {
    ...filters,
    bbox: boundsParameter(bounds),
  };
  delete next.lat;
  delete next.lng;
  delete next.radiusMeters;
  if (next.sort === 'distance') next.sort = 'newest';
  return next;
}

/** Ignore sub-pixel movement/URL rounding; longitude comparisons wrap at ±180°. */
export function viewportChanged(before: MapBounds, after: MapBounds): boolean {
  const span = (box: MapBounds) => (box.east - box.west + 360) % 360 || 360;
  const delta = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const longitudeTolerance = Math.max(0.00001, span(before) * 0.02);
  const latitudeTolerance = Math.max(
    0.00001,
    (before.north - before.south) * 0.02,
  );
  return (
    delta(before.west, after.west) > longitudeTolerance ||
    delta(before.east, after.east) > longitudeTolerance ||
    Math.abs(span(before) - span(after)) > longitudeTolerance ||
    Math.abs(before.south - after.south) > latitudeTolerance ||
    Math.abs(before.north - after.north) > latitudeTolerance
  );
}

export function cameraForSearch(
  urlCamera: MapCamera | null,
  filters: SearchParameters,
  firstPublicPoint?: { latitude: number; longitude: number } | null,
): MapCamera {
  if (urlCamera) return urlCamera;
  if (filters.lat && filters.lng)
    return {
      latitude: Number(filters.lat),
      longitude: Number(filters.lng),
      zoom: filters.radiusMeters
        ? Math.max(4, 14 - Math.log2(Number(filters.radiusMeters) / 1000 + 1))
        : 10,
    };
  if (filters.bbox) {
    const values = filters.bbox.split(',').map(Number);
    if (values.length === 4 && values.every(Number.isFinite)) {
      const [west, south, east, north] = values as [
        number,
        number,
        number,
        number,
      ];
      const longitude =
        west <= east
          ? (west + east) / 2
          : (((west + east + 360) / 2 + 180) % 360) - 180;
      return { latitude: (south + north) / 2, longitude, zoom: 8 };
    }
  }
  if (firstPublicPoint) return { ...firstPublicPoint, zoom: 10 };
  return { latitude: 50.85, longitude: 10.5, zoom: 4 };
}
