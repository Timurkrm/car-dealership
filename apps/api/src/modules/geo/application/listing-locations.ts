import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ListingLocation } from '../infrastructure/persistence/listing-location.entity';
import type { GeoPoint } from '../domain/location.types';
import { ApiException } from '../../../platform/http/api-error';

export interface LocationInput {
  latitude: number;
  longitude: number;
  city: string;
  countryCode: string;
  region?: string | null;
  publicPoint?: { latitude: number; longitude: number } | null;
}
export function geoPoint(latitude: number, longitude: number): GeoPoint {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    throw new ApiException(400, 'INVALID_LOCATION', 'Invalid coordinates');
  return { type: 'Point', coordinates: [longitude, latitude] };
}
@Injectable()
export class ListingLocations {
  async replace(
    listingId: string,
    input: LocationInput | null,
    manager: EntityManager,
  ): Promise<void> {
    if (input === null) {
      await manager.delete(ListingLocation, { listingId });
      return;
    }
    await manager.upsert(
      ListingLocation,
      {
        listingId,
        point: geoPoint(input.latitude, input.longitude),
        city: input.city,
        region: input.region ?? null,
        countryCode: input.countryCode,
        publicPoint: input.publicPoint
          ? geoPoint(input.publicPoint.latitude, input.publicPoint.longitude)
          : null,
      },
      ['listingId'],
    );
  }
  async readMany(
    ids: string[],
    manager: EntityManager,
    owner = false,
  ): Promise<ListingLocation[]> {
    if (!ids.length) return [];
    const query = manager
      .getRepository(ListingLocation)
      .createQueryBuilder('location')
      .where({ listingId: In(ids) });
    if (owner) query.addSelect('location.point');
    return query.getMany();
  }
}
