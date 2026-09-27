import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import { requestContext } from '../../../platform/http/request-context';
import { StructuredLogger } from '../../../platform/logging/structured-logger';
import { VehicleRecords, vehicleSpecification } from '../../vehicles';
import { ListingLocations } from '../../geo';
import { PartRecords } from '../../parts';
import { AuditWriter } from '../../audit';
import { OutboxWriter } from '../../outbox';
import { Listing } from '../infrastructure/persistence/listing.entity';
import { VehicleListing } from '../infrastructure/persistence/vehicle-listing.entity';
import { PartListing } from '../infrastructure/persistence/part-listing.entity';
import type {
  CreatePartListingInput,
  UpdatePartListingInput,
  OwnerPartListingResponse,
  MarketplaceOwner,
} from '../http/part-listing.dto';
import { ListingPersistence } from '../infrastructure/persistence/listing.persistence';
import { assertEditable, nextSellerStatus } from '../domain/listing-lifecycle';
import type { SellerAction } from '../domain/listing-lifecycle';
import { assertListingPrice } from '../domain/listing-price';
import { ListingQueries, listingNotFound } from './listing-queries';
import { ListingPublicationPolicy } from './listing-publication-policy';
import type {
  CreateListingInput,
  UpdateListingInput,
  OwnerListingResponse,
} from '../http/listing.dto';

function versionConflict(): ApiException {
  return new ApiException(
    409,
    'LISTING_VERSION_CONFLICT',
    'Listing changed; reload it before retrying',
  );
}
@Injectable()
export class ListingCommands {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingPersistence)
    private readonly persistence: ListingPersistence,
    @Inject(VehicleRecords) private readonly vehicles: VehicleRecords,
    @Inject(PartRecords) private readonly parts: PartRecords,
    @Inject(ListingLocations) private readonly locations: ListingLocations,
    @Inject(ListingQueries) private readonly queries: ListingQueries,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    @Inject(ListingPublicationPolicy)
    private readonly publication: ListingPublicationPolicy,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
  ) {}

  async create(
    sellerId: string,
    input: CreateListingInput,
  ): Promise<OwnerListingResponse> {
    assertListingPrice(
      input.listing.price.amountMinor,
      input.listing.price.currency,
    );
    const result = await this.database.source.transaction(async (manager) => {
      const vehicleId = await this.vehicles.create(input.vehicle, manager);
      const id = randomUUID();
      await manager.insert(Listing, {
        id,
        sellerId,
        type: 'VEHICLE',
        title: input.listing.title,
        description: input.listing.description ?? null,
        priceMinor: input.listing.price.amountMinor,
        currency: input.listing.price.currency,
        status: 'DRAFT',
        version: 1,
      });
      await manager.insert(VehicleListing, { listingId: id, vehicleId });
      if (input.location)
        await this.locations.replace(id, input.location, manager);
      await this.record(
        'LISTING_CREATED',
        sellerId,
        id,
        { nextStatus: 'DRAFT' },
        manager,
      );
      return this.queries.ownerVehicleInTransaction(id, sellerId, manager);
    });
    this.completed('listing_create', result.id);
    return result;
  }

  async update(
    id: string,
    sellerId: string,
    expectedVersion: number,
    input: UpdateListingInput,
  ): Promise<OwnerListingResponse> {
    if (
      !Object.keys(input).length ||
      (!input.location &&
        input.location !== null &&
        !Object.keys(input.vehicle ?? {}).length &&
        !Object.keys(input.listing ?? {}).length)
    )
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'At least one editable field is required',
      );
    const result = await this.database.source.transaction(async (manager) => {
      const listing = await this.lock(id, sellerId, expectedVersion, manager);
      if (listing.type !== 'VEHICLE') throw listingNotFound();
      assertEditable(listing.status);
      const changes: Partial<
        Pick<Listing, 'title' | 'description' | 'priceMinor' | 'currency'>
      > = {};
      const changedFields: string[] = [];
      if (input.vehicle && Object.keys(input.vehicle).length) {
        const link = await manager.findOneByOrFail(VehicleListing, {
          listingId: id,
        });
        const current = (
          await this.vehicles.readMany([link.vehicleId], manager, true)
        )[0];
        if (!current) throw new Error('Missing vehicle aggregate');
        const previous = vehicleSpecification(current);
        const next = vehicleSpecification({ ...previous, ...input.vehicle });
        const previousFields = new Map(Object.entries(previous));
        const fields = Object.entries(next)
          .filter(([key, value]) => previousFields.get(key) !== value)
          .map(([key]) => key);
        if (fields.length) {
          // Copy-on-write prevents editing another offer that references the same observation.
          const vehicleId = await this.vehicles.create(next, manager);
          await manager.update(
            VehicleListing,
            { listingId: id },
            { vehicleId },
          );
          changedFields.push(
            ...fields.map(
              (field) => `vehicle${field[0]?.toUpperCase()}${field.slice(1)}`,
            ),
          );
        }
      }
      Object.assign(
        changes,
        await this.commonChanges(listing, input, manager, changedFields),
      );
      if (changedFields.length) {
        if (!(await this.persistence.compareAndSet(listing, changes, manager)))
          throw versionConflict();
        await this.record(
          'LISTING_UPDATED',
          sellerId,
          id,
          { changedFields },
          manager,
        );
      }
      return this.queries.ownerVehicleInTransaction(id, sellerId, manager);
    });
    this.completed('listing_update', id);
    return result;
  }

  async transition(
    id: string,
    sellerId: string,
    expectedVersion: number,
    action: SellerAction,
  ): Promise<MarketplaceOwner> {
    const result = await this.database.source.transaction(async (manager) => {
      const listing = await this.lock(id, sellerId, expectedVersion, manager);
      const status = nextSellerStatus(listing.status, action);
      // Repeating archive with the current ETag is idempotent; stale ETags still conflict.
      if (status === listing.status)
        return this.queries.ownerInTransaction(id, sellerId, manager);
      if (action === 'submit')
        await this.publication.assertReady(listing, manager);
      const now = new Date();
      const changes: Partial<
        Pick<Listing, 'status' | 'submittedAt' | 'archivedAt' | 'soldAt'>
      > = { status };
      if (action === 'submit') changes.submittedAt = now;
      if (action === 'archive') changes.archivedAt = now;
      if (action === 'mark-sold') changes.soldAt = now;
      if (action === 'mark-sold' && listing.type === 'PART')
        await manager.update(
          PartListing,
          { listingId: id },
          { quantityAvailable: 0 },
        );
      if (!(await this.persistence.compareAndSet(listing, changes, manager)))
        throw versionConflict();
      const event = {
        submit: 'LISTING_SUBMITTED',
        archive: 'LISTING_ARCHIVED',
        'mark-sold': 'LISTING_MARKED_SOLD',
      }[action];
      await this.record(
        event,
        sellerId,
        id,
        {
          previousStatus: listing.status,
          nextStatus: status,
          listingType: listing.type,
        },
        manager,
      );
      if (action === 'archive' || action === 'mark-sold')
        await this.outbox.listingLifecycle(
          action === 'archive' ? 'LISTING_ARCHIVED' : 'LISTING_MARKED_SOLD',
          {
            schemaVersion: 1,
            listingId: id,
            listingType: listing.type,
            sellerId,
            previousStatus: listing.status,
            nextStatus: status as 'SOLD' | 'ARCHIVED',
          },
          manager,
        );
      return this.queries.ownerInTransaction(id, sellerId, manager);
    });
    this.completed(`listing_${action.replace('-', '_')}`, id);
    return result;
  }
  private async lock(
    id: string,
    sellerId: string,
    expectedVersion: number,
    manager: EntityManager,
  ): Promise<Listing> {
    const listing = await this.persistence.lockOwned(id, sellerId, manager);
    if (!listing) throw listingNotFound();
    if (listing.version !== expectedVersion) throw versionConflict();
    return listing;
  }
  async createPart(
    sellerId: string,
    input: CreatePartListingInput,
  ): Promise<OwnerPartListingResponse> {
    assertListingPrice(
      input.listing.price.amountMinor,
      input.listing.price.currency,
    );
    const result = await this.database.source.transaction(async (manager) => {
      const partId = await this.parts.create(input.part, manager);
      const id = randomUUID();
      await manager.insert(Listing, {
        id,
        sellerId,
        type: 'PART',
        title: input.listing.title,
        description: input.listing.description ?? null,
        priceMinor: input.listing.price.amountMinor,
        currency: input.listing.price.currency,
        status: 'DRAFT',
        version: 1,
      });
      await manager.insert(PartListing, {
        listingId: id,
        partId,
        quantityAvailable: input.quantityAvailable,
      });
      if (input.location)
        await this.locations.replace(id, input.location, manager);
      await this.record(
        'LISTING_CREATED',
        sellerId,
        id,
        { nextStatus: 'DRAFT', listingType: 'PART' },
        manager,
      );
      const row = await this.queries.ownerInTransaction(id, sellerId, manager);
      if (row.type !== 'PART') throw listingNotFound();
      return row;
    });
    this.completed('listing_create_part', result.id);
    return result;
  }
  async updatePart(
    id: string,
    sellerId: string,
    expectedVersion: number,
    input: UpdatePartListingInput,
  ): Promise<OwnerPartListingResponse> {
    if (
      !Object.keys(input.listing ?? {}).length &&
      !Object.keys(input.part ?? {}).length &&
      input.quantityAvailable === undefined &&
      input.location === undefined
    )
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'At least one editable field is required',
      );
    const result = await this.database.source.transaction(async (manager) => {
      const listing = await this.lock(id, sellerId, expectedVersion, manager);
      if (listing.type !== 'PART') throw listingNotFound();
      assertEditable(listing.status);
      const link = await manager.findOneByOrFail(PartListing, {
        listingId: id,
      });
      const changedFields: string[] = [];
      const changes = await this.commonChanges(
        listing,
        input,
        manager,
        changedFields,
      );
      if (input.part && Object.keys(input.part).length) {
        await this.parts.update(link.partId, input.part, manager);
        changedFields.push('part');
      }
      if (
        input.quantityAvailable !== undefined &&
        input.quantityAvailable !== link.quantityAvailable
      ) {
        await manager.update(
          PartListing,
          { listingId: id },
          { quantityAvailable: input.quantityAvailable },
        );
        changedFields.push('quantityAvailable');
      }
      if (changedFields.length) {
        if (!(await this.persistence.compareAndSet(listing, changes, manager)))
          throw versionConflict();
        await this.record(
          'LISTING_UPDATED',
          sellerId,
          id,
          { changedFields, listingType: 'PART' },
          manager,
        );
      }
      const row = await this.queries.ownerInTransaction(id, sellerId, manager);
      if (row.type !== 'PART') throw listingNotFound();
      return row;
    });
    this.completed('listing_update_part', id);
    return result;
  }
  private async commonChanges(
    listing: Listing,
    input: UpdateListingInput,
    manager: EntityManager,
    changedFields: string[],
  ) {
    const changes: Partial<
      Pick<Listing, 'title' | 'description' | 'priceMinor' | 'currency'>
    > = {};
    if (
      input.listing?.title !== undefined &&
      input.listing.title !== listing.title
    ) {
      changes.title = input.listing.title;
      changedFields.push('title');
    }
    if (
      input.listing?.description !== undefined &&
      input.listing.description !== listing.description
    ) {
      changes.description = input.listing.description;
      changedFields.push('description');
    }
    if (input.listing?.price) {
      const { amountMinor, currency } = input.listing.price;
      assertListingPrice(amountMinor, currency);
      if (amountMinor !== listing.priceMinor || currency !== listing.currency) {
        changes.priceMinor = amountMinor;
        changes.currency = currency;
        changedFields.push('price');
      }
    }
    if (input.location !== undefined) {
      await this.locations.replace(listing.id, input.location, manager);
      changedFields.push('location');
    }
    return changes;
  }
  private record(
    action: string,
    actorUserId: string,
    targetId: string,
    metadata: {
      changedFields?: string[];
      previousStatus?: string;
      nextStatus?: string;
      listingType?: 'VEHICLE' | 'PART';
    },
    manager: EntityManager,
  ) {
    return this.audit.append(
      {
        action,
        actorUserId,
        targetType: 'LISTING',
        targetId,
        requestId: requestContext.getStore()?.requestId ?? null,
        metadata,
      },
      manager,
    );
  }
  private completed(operation: string, entityId: string): void {
    this.logger.event('info', 'Listing operation completed', {
      operation,
      entityId,
    });
  }
}
