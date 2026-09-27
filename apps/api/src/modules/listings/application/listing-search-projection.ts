import { Inject, Injectable } from '@nestjs/common';
import type { SelectQueryBuilder } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { Listing } from '../infrastructure/persistence/listing.entity';
import { VehicleListing } from '../infrastructure/persistence/vehicle-listing.entity';
import { PartListing } from '../infrastructure/persistence/part-listing.entity';
import { SUPPORTED_CURRENCIES } from '../domain/listing-price';

export const LISTING_SEARCH_COLUMNS = {
  price: 'listing.priceMinor',
  published: 'listing.publishedAt',
  id: 'listing.id',
} as const;

/** Public discovery is intentionally narrower than historical SOLD detail. */
@Injectable()
export class ListingSearchProjection {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
  ) {}
  published(type: 'VEHICLE' | 'PART'): SelectQueryBuilder<Listing> {
    const query = this.database.source
      .getRepository(Listing)
      .createQueryBuilder('listing')
      .select('listing.id', 'id')
      .addSelect('listing.type', 'type')
      .addSelect('listing.title', 'title')
      .addSelect('listing.priceMinor', 'priceMinor')
      .addSelect('listing.currency', 'currency')
      .addSelect(
        `to_char(listing.publishedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'publishedAt',
      )
      .where("listing.status = 'PUBLISHED' AND listing.type = :listingType", {
        listingType: type,
      })
      .andWhere('listing.currency IN (:...publishedCurrencies)', {
        publishedCurrencies: SUPPORTED_CURRENCIES,
      })
      .andWhere(
        'listing.priceMinor > 0 AND listing.description IS NOT NULL AND length(btrim(listing.description)) > 0',
      );
    if (type === 'VEHICLE')
      query.innerJoin(
        VehicleListing,
        'vehicleOffer',
        'vehicleOffer.listingId = listing.id',
      );
    else
      query
        .innerJoin(PartListing, 'partOffer', 'partOffer.listingId = listing.id')
        .andWhere('partOffer.quantityAvailable > 0');
    return query;
  }
  filter(
    query: SelectQueryBuilder<Listing>,
    filters: {
      currency?: string;
      priceFromMinor?: string;
      priceToMinor?: string;
    },
  ): void {
    if (filters.currency)
      query.andWhere('listing.currency = :currency', {
        currency: filters.currency,
      });
    if (filters.priceFromMinor)
      query.andWhere('listing.priceMinor >= :priceFromMinor', {
        priceFromMinor: filters.priceFromMinor,
      });
    if (filters.priceToMinor)
      query.andWhere('listing.priceMinor <= :priceToMinor', {
        priceToMinor: filters.priceToMinor,
      });
  }
}
