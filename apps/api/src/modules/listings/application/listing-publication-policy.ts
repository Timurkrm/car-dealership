import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { EntityManager } from 'typeorm';
import { ApiException } from '../../../platform/http/api-error';
import { ListingLocations } from '../../geo';
import { PartRecords } from '../../parts';
import {
  VehicleInput,
  VehicleRecords,
  vehicleSpecification,
} from '../../vehicles';
import { assertListingPrice } from '../domain/listing-price';
import type { Listing } from '../infrastructure/persistence/listing.entity';
import { PartListing } from '../infrastructure/persistence/part-listing.entity';
import { VehicleListing } from '../infrastructure/persistence/vehicle-listing.entity';
import { ListingMediaPort } from './listing-media.port';

/** One publication-invariant policy shared by seller submission and moderator approval. */
@Injectable()
export class ListingPublicationPolicy {
  constructor(
    @Inject(VehicleRecords) private readonly vehicles: VehicleRecords,
    @Inject(PartRecords) private readonly parts: PartRecords,
    @Inject(ListingLocations) private readonly locations: ListingLocations,
    @Inject(ListingMediaPort) private readonly media: ListingMediaPort,
  ) {}

  async assertReady(listing: Listing, manager: EntityManager): Promise<void> {
    assertListingPrice(listing.priceMinor, listing.currency);
    if (!listing.title.trim() || !listing.description?.trim())
      throw incomplete('Title and description are required');
    await this.media.assertSubmissionReady(listing.id, manager);
    if (listing.type === 'PART') {
      const link = await manager.findOneBy(PartListing, {
        listingId: listing.id,
      });
      if (!link || link.quantityAvailable < 1)
        throw incomplete('A positive part quantity is required');
      await this.parts.assertReady(link.partId, manager);
      return;
    }
    const link = await manager.findOneBy(VehicleListing, {
      listingId: listing.id,
    });
    const vehicle = (
      await this.vehicles.readMany(link ? [link.vehicleId] : [], manager, true)
    )[0];
    const location = (
      await this.locations.readMany([listing.id], manager, true)
    )[0];
    if (!vehicle || !location)
      throw incomplete('Vehicle and exact location are required');
    const input = plainToInstance(VehicleInput, vehicleSpecification(vehicle));
    if (
      validateSync(input).length ||
      !vehicle.model ||
      (vehicle.generation && vehicle.generation.modelId !== vehicle.modelId)
    )
      throw incomplete('Vehicle catalog data is invalid');
  }
}

function incomplete(message: string): ApiException {
  return new ApiException(400, 'LISTING_INCOMPLETE', message);
}
