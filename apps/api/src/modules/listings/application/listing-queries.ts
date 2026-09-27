import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import { pageOf } from '../../../platform/http/page.dto';
import { VehicleRecords } from '../../vehicles';
import type { VehicleRecord } from '../../vehicles';
import { PartRecords } from '../../parts';
import type { PartRecord } from '../../parts';
import { ListingLocations } from '../../geo';
import type { LocationRecord } from '../../geo';
import { UserIdentity } from '../../users';
import { ListingPersistence } from '../infrastructure/persistence/listing.persistence';
import { Listing } from '../infrastructure/persistence/listing.entity';
import { VehicleListing } from '../infrastructure/persistence/vehicle-listing.entity';
import { PartListing } from '../infrastructure/persistence/part-listing.entity';
import { ListingMediaPort } from './listing-media.port';
import type {
  OwnerListingResponse,
  PublicListingResponse,
  PublicListingSummary,
  SellerListQuery,
} from '../http/listing.dto';
import type {
  MarketplaceOwner,
  MarketplacePublic,
  PublicPartListingResponse,
} from '../http/part-listing.dto';
import {
  common,
  locationPublic,
  mapOwnerListing,
  mapPublicListing,
  mapOwnerListingSummary,
  ownerPartDetail,
  ownerPartSummary,
  partDetail,
  partSummary,
} from './listing-mapping';

type Aggregate = { listing: Listing; location: LocationRecord | undefined } & (
  | { type: 'VEHICLE'; vehicle: VehicleRecord }
  | { type: 'PART'; part: PartRecord; quantity: number }
);
export function listingNotFound(): ApiException {
  return new ApiException(404, 'LISTING_NOT_FOUND', 'Listing not found');
}
@Injectable()
export class ListingQueries {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingPersistence)
    private readonly persistence: ListingPersistence,
    @Inject(VehicleRecords) private readonly vehicles: VehicleRecords,
    @Inject(PartRecords) private readonly parts: PartRecords,
    @Inject(ListingLocations) private readonly locations: ListingLocations,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(ListingMediaPort) private readonly media: ListingMediaPort,
  ) {}
  owner(id: string, sellerId: string): Promise<MarketplaceOwner> {
    return this.database.source.transaction('REPEATABLE READ', (manager) =>
      this.ownerInTransaction(id, sellerId, manager),
    );
  }
  async ownerInTransaction(
    id: string,
    sellerId: string,
    manager: EntityManager,
  ): Promise<MarketplaceOwner> {
    const listing = await this.persistence.findOwned(id, sellerId, manager);
    if (!listing) throw listingNotFound();
    const record = (await this.records([listing], manager, true))[0];
    if (!record) throw new Error('Missing listing aggregate');
    const photos = await this.media.readMany([id], manager, true);
    const mapped =
      record.type === 'VEHICLE'
        ? mapOwnerListing(listing, record.vehicle, record.location)
        : ownerPartDetail(
            listing,
            record.part,
            record.quantity,
            record.location,
          );
    return {
      ...mapped,
      media: photos.get(id) ?? [],
      cover:
        photos.get(id)?.find((photo) => photo.isPrimary)?.variants?.thumbnail ??
        null,
    };
  }
  async ownerVehicleInTransaction(
    id: string,
    sellerId: string,
    manager: EntityManager,
  ): Promise<OwnerListingResponse> {
    const row = await this.ownerInTransaction(id, sellerId, manager);
    if (row.type !== 'VEHICLE') throw listingNotFound();
    return row;
  }
  async ownList(sellerId: string, query: SellerListQuery) {
    return this.database.source.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const rows = await this.persistence.listOwned(query, manager, {
          id: sellerId,
          status: query.status,
          type: query.type,
          sort: query.sort,
        });
        const page = pageOf(rows, query);
        const records = await this.records(page.items, manager, false, false);
        const covers = await this.media.readMany(
          page.items.map((row) => row.id),
          manager,
          false,
          true,
        );
        return {
          ...page,
          items: records.map((record) => ({
            ...(record.type === 'VEHICLE'
              ? mapOwnerListingSummary(
                  record.listing,
                  record.vehicle,
                  record.location,
                )
              : ownerPartSummary(
                  record.listing,
                  record.part,
                  record.quantity,
                  record.location,
                )),
            cover:
              covers.get(record.listing.id)?.find((photo) => photo.isPrimary)
                ?.variants?.thumbnail ?? null,
          })),
        };
      },
    );
  }
  async moderationSummaries(listings: Listing[], manager: EntityManager) {
    const records = await this.records(listings, manager, false, false);
    return new Map(
      records.map((record) => [
        record.listing.id,
        record.type === 'VEHICLE'
          ? {
              kind: 'VEHICLE' as const,
              make: record.vehicle.model.make.name,
              model: record.vehicle.model.name,
              year: record.vehicle.year,
              mileageKm: record.vehicle.mileageKm,
            }
          : {
              kind: 'PART' as const,
              name: record.part.name,
              category: record.part.category.name,
              condition: record.part.condition,
              quantityAvailable: record.quantity,
            },
      ]),
    );
  }
  async favoriteCardsInTransaction(
    ids: string[],
    manager: EntityManager,
  ): Promise<Map<string, FavoriteListingCard>> {
    if (!ids.length) return new Map();
    const listings = await manager.find(Listing, {
      where: { id: In(ids), status: In(['PUBLISHED', 'SOLD']) },
    });
    const records = await this.records(listings, manager, false, false);
    const covers = await this.media.readMany(ids, manager, false, true);
    const result = new Map<string, FavoriteListingCard>();
    for (const record of records) {
      const cover = covers
        .get(record.listing.id)
        ?.find((photo) => photo.isPrimary)?.variants?.thumbnail;
      if (!cover) continue;
      const base = {
        listingId: record.listing.id,
        title: record.listing.title,
        status: record.listing.status as 'PUBLISHED' | 'SOLD',
        price: {
          amountMinor: record.listing.priceMinor,
          currency: record.listing.currency,
        },
        publishedAt: record.listing.publishedAt?.toISOString() ?? null,
        cover,
        location: locationPublic(record.location),
      };
      result.set(
        record.listing.id,
        record.type === 'VEHICLE'
          ? {
              ...base,
              type: 'VEHICLE',
              vehicle: {
                make: {
                  id: record.vehicle.model.make.id,
                  name: record.vehicle.model.make.name,
                },
                model: {
                  id: record.vehicle.model.id,
                  name: record.vehicle.model.name,
                },
                year: record.vehicle.year,
                mileageKm: record.vehicle.mileageKm,
              },
            }
          : {
              ...base,
              type: 'PART',
              part: partSummary(record.part, record.quantity),
            },
      );
    }
    return result;
  }
  async publicDetail(id: string): Promise<PublicListingResponse> {
    const row = await this.publicTypedDetail(id, 'VEHICLE');
    if (row.type !== 'VEHICLE') throw listingNotFound();
    return row;
  }
  async publicPartDetail(id: string): Promise<PublicPartListingResponse> {
    const row = await this.publicTypedDetail(id, 'PART');
    if (row.type !== 'PART') throw listingNotFound();
    return row;
  }
  private async publicTypedDetail(
    id: string,
    type: 'VEHICLE' | 'PART',
  ): Promise<MarketplacePublic> {
    return this.database.source.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const listing = await this.persistence.findPublic(id, manager);
        if (!listing || listing.type !== type) throw listingNotFound();
        const record = (await this.records([listing], manager))[0];
        if (!record) throw new Error('Missing public listing aggregate');
        const seller = (
          await this.users.publicSummaries([listing.sellerId], manager)
        )[0];
        if (!seller) throw new Error('Missing public seller');
        const photos = await this.media.readMany([id], manager, false);
        const mapped =
          record.type === 'VEHICLE'
            ? mapPublicListing(listing, record.vehicle, record.location, seller)
            : {
                ...common(listing),
                type: 'PART' as const,
                part: partDetail(record.part, record.quantity),
                location: locationPublic(record.location),
                seller: { id: seller.id, displayName: seller.displayName },
                description: listing.description,
              };
        return {
          ...mapped,
          media: photos.get(id) ?? [],
          cover:
            photos.get(id)?.find((photo) => photo.isPrimary)?.variants
              ?.thumbnail ?? null,
        };
      },
    );
  }
  private async records(
    listings: Listing[],
    manager: EntityManager,
    owner = false,
    detail = true,
  ): Promise<Aggregate[]> {
    const vehicleIds = listings
      .filter((row) => row.type === 'VEHICLE')
      .map((row) => row.id);
    const partIds = listings
      .filter((row) => row.type === 'PART')
      .map((row) => row.id);
    const vehicleLinks = vehicleIds.length
      ? await manager.findBy(VehicleListing, { listingId: In(vehicleIds) })
      : [];
    const partLinks = partIds.length
      ? await manager.findBy(PartListing, { listingId: In(partIds) })
      : [];
    const vehicles = new Map(
      (
        await this.vehicles.readMany(
          [...new Set(vehicleLinks.map((row) => row.vehicleId))],
          manager,
          owner,
        )
      ).map((row) => [row.id, row]),
    );
    const parts = new Map(
      (
        await this.parts.readMany(
          partLinks.map((row) => row.partId),
          manager,
          detail,
        )
      ).map((row) => [row.id, row]),
    );
    const vehicleByListing = new Map(
      vehicleLinks.map((row) => [row.listingId, vehicles.get(row.vehicleId)]),
    );
    const partByListing = new Map(
      partLinks.map((row) => [
        row.listingId,
        { part: parts.get(row.partId), quantity: row.quantityAvailable },
      ]),
    );
    const locations = new Map(
      (
        await this.locations.readMany(
          listings.map((row) => row.id),
          manager,
          owner,
        )
      ).map((row) => [row.listingId, row]),
    );
    return listings.map((listing) => {
      const location = locations.get(listing.id);
      if (listing.type === 'VEHICLE') {
        const vehicle = vehicleByListing.get(listing.id);
        if (!vehicle) throw new Error('Missing vehicle subtype');
        return { type: 'VEHICLE', listing, vehicle, location };
      }
      const offer = partByListing.get(listing.id);
      if (!offer?.part) throw new Error('Missing part subtype');
      return {
        type: 'PART',
        listing,
        part: offer.part,
        quantity: offer.quantity,
        location,
      };
    });
  }
}

export type FavoriteListingCard =
  | {
      listingId: string;
      type: 'VEHICLE';
      title: string;
      status: 'PUBLISHED' | 'SOLD';
      price: { amountMinor: string; currency: string };
      publishedAt: string | null;
      cover: NonNullable<PublicListingSummary['cover']>;
      location: ReturnType<typeof locationPublic>;
      vehicle: {
        make: { id: string; name: string };
        model: { id: string; name: string };
        year: number;
        mileageKm: number;
      };
    }
  | {
      listingId: string;
      type: 'PART';
      title: string;
      status: 'PUBLISHED' | 'SOLD';
      price: { amountMinor: string; currency: string };
      publishedAt: string | null;
      cover: NonNullable<PublicListingSummary['cover']>;
      location: ReturnType<typeof locationPublic>;
      part: ReturnType<typeof partSummary>;
    };
