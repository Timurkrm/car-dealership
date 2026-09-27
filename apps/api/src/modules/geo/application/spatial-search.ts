import { Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { ApiException } from '../../../platform/http/api-error';
import { ListingLocation } from '../infrastructure/persistence/listing-location.entity';

export type SpatialSearch =
  | { mode: 'none' }
  | { mode: 'bbox'; west: number; south: number; east: number; north: number }
  | {
      mode: 'origin';
      latitude: number;
      longitude: number;
      radiusMeters?: number;
    };

function fail(code: string): never {
  throw new ApiException(400, code, 'Invalid geographic search');
}
function coordinate(value: string | undefined, latitude: boolean): number {
  if (!value || value.length > 24 || !/^-?\d{1,3}(?:\.\d{1,8})?$/.test(value))
    return fail('GEO_INVALID_COORDINATES');
  const number = Number(value);
  const max = latitude ? 90 : 180;
  if (!Number.isFinite(number) || Math.abs(number) > max)
    return fail('GEO_INVALID_COORDINATES');
  return number === 0 ? 0 : number;
}
export function parseSpatialSearch(
  input: Record<string, string | undefined>,
  maximumRadius = 250000,
): SpatialSearch {
  const origin =
    input.lat !== undefined ||
    input.lng !== undefined ||
    input.radiusMeters !== undefined;
  if (input.bbox !== undefined && origin)
    return fail('GEO_CONFLICTING_FILTERS');
  if (input.bbox !== undefined) {
    const values = input.bbox.split(',');
    if (values.length !== 4) return fail('GEO_INVALID_BBOX');
    let west: number, south: number, east: number, north: number;
    try {
      west = coordinate(values[0], false);
      south = coordinate(values[1], true);
      east = coordinate(values[2], false);
      north = coordinate(values[3], true);
    } catch {
      return fail('GEO_INVALID_BBOX');
    }
    if (south > north) return fail('GEO_INVALID_BBOX');
    return { mode: 'bbox', west, south, east, north };
  }
  if (!origin) return { mode: 'none' };
  const latitude = coordinate(input.lat, true);
  const longitude = coordinate(input.lng, false);
  if (input.radiusMeters === undefined)
    return { mode: 'origin', latitude, longitude };
  if (
    !/^[1-9]\d{0,5}$/.test(input.radiusMeters) ||
    Number(input.radiusMeters) > maximumRadius
  )
    return fail('GEO_INVALID_RADIUS');
  return {
    mode: 'origin',
    latitude,
    longitude,
    radiusMeters: Number(input.radiusMeters),
  };
}

/** Anonymous distances are kilometre buckets, with 0 meaning strictly less than 1 km. */
export function publicDistance(meters: number | null): number | null {
  if (meters === null) return null;
  if (!Number.isFinite(meters) || meters < 0)
    throw new RangeError('Invalid distance');
  return meters < 1000 ? 0 : Math.round(meters / 1000) * 1000;
}
export const GEOGRAPHY_DISTANCE =
  'location.point::geography <-> ST_SetSRID(ST_MakePoint(:originLng, :originLat), 4326)::geography';

type Bbox = Extract<SpatialSearch, { mode: 'bbox' }>;
/** Zero-area polygons do not represent inclusive point/line viewport membership. */
function viewportEnvelope(
  bbox: Bbox,
  west: number,
  east: number,
  westBinding: string,
  eastBinding: string,
): string {
  if (west === east && bbox.south === bbox.north)
    return `ST_SetSRID(ST_MakePoint(${westBinding}, :south), 4326)`;
  if (west === east || bbox.south === bbox.north)
    return `ST_SetSRID(ST_MakeLine(ST_MakePoint(${westBinding}, :south), ST_MakePoint(${eastBinding}, :north)), 4326)`;
  return `ST_MakeEnvelope(${westBinding}, :south, ${eastBinding}, :north, 4326)`;
}

/** Owner-approved spatial projection; private points never become selected result columns. */
@Injectable()
export class SpatialSearchProjection {
  attach<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    spatial: SpatialSearch,
    markers = false,
    locationOptional = false,
  ): void {
    if (spatial.mode === 'none' && !markers && locationOptional)
      query.leftJoin(
        ListingLocation,
        'location',
        'location.listingId = listing.id',
      );
    else
      query.innerJoin(
        ListingLocation,
        'location',
        'location.listingId = listing.id',
      );
    query
      .addSelect('location.city', 'city')
      .addSelect('location.region', 'region')
      .addSelect('location.countryCode', 'countryCode')
      .addSelect('ST_Y(location.publicPoint)', 'publicLatitude')
      .addSelect('ST_X(location.publicPoint)', 'publicLongitude');
    if (markers) query.andWhere('location.publicPoint IS NOT NULL');
    if (spatial.mode === 'bbox') this.searchByViewport(query, spatial, markers);
    if (spatial.mode === 'origin') this.searchNearby(query, spatial);
    else query.addSelect('NULL::double precision', 'distance');
  }
  searchByViewport<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    bbox: Extract<SpatialSearch, { mode: 'bbox' }>,
    markers = false,
  ): void {
    const point = markers ? 'location.publicPoint' : 'location.point';
    const envelope = viewportEnvelope(
      bbox,
      bbox.west,
      bbox.east,
      ':west',
      ':east',
    );
    query.setParameters(bbox);
    if (bbox.west <= bbox.east)
      query.andWhere(`ST_Intersects(${point}, ${envelope})`);
    else
      query.andWhere(
        `(ST_Intersects(${point}, ${viewportEnvelope(bbox, bbox.west, 180, ':west', '180')}) OR ST_Intersects(${point}, ${viewportEnvelope(bbox, -180, bbox.east, '-180', ':east')}))`,
      );
  }
  /** Independent public display viewport; bindings cannot collide with private search bbox. */
  searchByPublicViewport<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    bbox: Bbox,
  ): void {
    query.setParameters({
      viewportWest: bbox.west,
      viewportSouth: bbox.south,
      viewportEast: bbox.east,
      viewportNorth: bbox.north,
    });
    const envelope = (
      west: number,
      east: number,
      westSql: string,
      eastSql: string,
    ) => {
      if (west === east && bbox.south === bbox.north)
        return `ST_SetSRID(ST_MakePoint(${westSql}, :viewportSouth), 4326)`;
      if (west === east || bbox.south === bbox.north)
        return `ST_SetSRID(ST_MakeLine(ST_MakePoint(${westSql}, :viewportSouth), ST_MakePoint(${eastSql}, :viewportNorth)), 4326)`;
      return `ST_MakeEnvelope(${westSql}, :viewportSouth, ${eastSql}, :viewportNorth, 4326)`;
    };
    if (bbox.west <= bbox.east)
      query.andWhere(
        `ST_Intersects(location.publicPoint, ${envelope(bbox.west, bbox.east, ':viewportWest', ':viewportEast')})`,
      );
    else
      query.andWhere(
        `(ST_Intersects(location.publicPoint, ${envelope(bbox.west, 180, ':viewportWest', '180')}) OR ST_Intersects(location.publicPoint, ${envelope(-180, bbox.east, '-180', ':viewportEast')}))`,
      );
  }
  searchNearby<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    origin: Extract<SpatialSearch, { mode: 'origin' }>,
  ): void {
    query.setParameters({
      originLng: origin.longitude,
      originLat: origin.latitude,
    });
    query.addSelect(`(${GEOGRAPHY_DISTANCE})`, 'distance');
    if (origin.radiusMeters !== undefined)
      query.andWhere(
        'ST_DWithin(location.point::geography, ST_SetSRID(ST_MakePoint(:originLng, :originLat), 4326)::geography, :radiusMeters, false)',
        { radiusMeters: origin.radiusMeters },
      );
  }
}
