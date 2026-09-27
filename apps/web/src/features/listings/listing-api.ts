import { AuthApiError } from '../auth/auth-client';
import type { AuthClient } from '../auth/auth-client';
import {
  invalid,
  object,
  text,
  nullableText,
  integer,
  nullableNumber,
  id,
  catalogItem,
  generation,
  point,
  location,
  base,
  page,
} from './listing-response';
import { parsePartOwner, parsePartOwnerSummary } from '../parts/part-response';
import { parsePhotos } from '../media/media-client';
import type {
  OwnerListing,
  OwnerListingSummary,
  MarketplaceOwnerSummary,
  Page,
  CatalogItem,
  OwnerLocation,
  OwnerResult,
  PublicListing,
  PublicListingSummary,
  Vehicle,
} from './listing-types';

function vehicle(value: unknown): Vehicle {
  const row = object(value);
  return {
    id: id(row.id),
    make: catalogItem(row.make),
    model: catalogItem(row.model),
    generation: row.generation === null ? null : generation(row.generation),
    year: integer(row.year, 1886, 2100),
    mileageKm: integer(row.mileageKm),
    bodyType: text(row.bodyType),
    fuelType: text(row.fuelType),
    transmission: text(row.transmission),
    driveType: text(row.driveType),
    condition: text(row.condition),
    enginePowerHp: nullableNumber(row.enginePowerHp),
    engineDisplacementCc: nullableNumber(row.engineDisplacementCc),
    color: nullableText(row.color),
  };
}
function parsePublicSummary(value: unknown): PublicListingSummary {
  const row = object(value);
  if (row.type !== 'VEHICLE') return invalid();
  const listing = base(row);
  if (listing.status !== 'PUBLISHED' && listing.status !== 'SOLD')
    return invalid();
  return {
    ...listing,
    type: 'VEHICLE',
    vehicle: vehicle(row.vehicle),
    location: location(row.location),
    seller: {
      id: id(object(row.seller).id),
      displayName: text(object(row.seller).displayName),
    },
  };
}
export function parsePublicListing(value: unknown): PublicListing {
  const media = object(value).media;
  if (media !== undefined && (!Array.isArray(media) || media.length > 30))
    return invalid();
  return {
    ...parsePublicSummary(value),
    description: nullableText(object(value).description),
    media: parsePhotos(media),
  };
}
function parseOwnerSummary(value: unknown): OwnerListingSummary {
  const row = object(value);
  if (row.type !== 'VEHICLE') return invalid();
  return {
    ...base(row),
    type: 'VEHICLE',
    vehicle: vehicle(row.vehicle),
    location: location(row.location),
    version: integer(row.version, 1),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    submittedAt: nullableText(row.submittedAt),
    archivedAt: nullableText(row.archivedAt),
  };
}
function parseOwnerListing(value: unknown): OwnerListing {
  const row = object(value);
  const locationPublic = location(row.location);
  const ownerLocation: OwnerLocation | null = locationPublic
    ? { ...locationPublic, exactPoint: point(object(row.location).exactPoint) }
    : null;
  return {
    ...parseOwnerSummary(row),
    description: nullableText(row.description),
    media: parsePhotos(row.media),
    vehicle: {
      ...vehicle(row.vehicle),
      vin: nullableText(object(row.vehicle).vin),
    },
    location: ownerLocation,
  };
}
async function owner(response: Response): Promise<OwnerResult> {
  const value: unknown = await response.json();
  const listing =
    object(value).type === 'PART'
      ? parsePartOwner(value)
      : parseOwnerListing(value);
  const etag = response.headers.get('etag');
  if (etag !== `"${listing.version}"`) return invalid();
  return { listing, etag };
}
export class ListingApi {
  constructor(private readonly client: AuthClient) {}
  async catalog(
    kind: 'makes' | 'models' | 'generations',
    parent?: string,
    signal?: AbortSignal,
  ): Promise<CatalogItem[]> {
    if (kind !== 'makes' && !parent) return invalid();
    const path =
      kind === 'makes'
        ? 'catalog/vehicle-makes'
        : kind === 'models'
          ? `catalog/vehicle-makes/${id(parent)}/models`
          : `catalog/vehicle-models/${id(parent)}/generations`;
    const items: CatalogItem[] = [];
    // Catalog pagination is bounded server-side; continue explicitly instead of silently dropping choices.
    for (let offset = 0; offset <= 10000; offset += 50) {
      const result = page(
        await (
          await this.client.api(`${path}?limit=50&offset=${offset}`, { signal })
        ).json(),
        catalogItem,
      );
      items.push(...result.items);
      if (!result.hasMore) return items;
    }
    throw new AuthApiError(422, 'CATALOG_TOO_LARGE');
  }
  async publicDetail(
    listingId: string,
    signal?: AbortSignal,
  ): Promise<PublicListing> {
    return parsePublicListing(
      await (
        await this.client.api(`listings/${id(listingId)}`, { signal })
      ).json(),
    );
  }
  async ownList(
    offset: number,
    status: string,
    sort: string,
    signal?: AbortSignal,
    type = '',
  ): Promise<Page<MarketplaceOwnerSummary>> {
    return page(
      await (
        await this.client.apiAuthenticated(
          `me/listings?limit=20&offset=${offset}&sort=${encodeURIComponent(sort)}${status ? `&status=${encodeURIComponent(status)}` : ''}${type ? `&type=${encodeURIComponent(type)}` : ''}`,
          { signal },
        )
      ).json(),
      (row) =>
        object(row).type === 'PART'
          ? parsePartOwnerSummary(row)
          : parseOwnerSummary(row),
    );
  }
  async ownDetail(
    listingId: string,
    signal?: AbortSignal,
  ): Promise<OwnerResult> {
    return owner(
      await this.client.apiAuthenticated(`me/listings/${id(listingId)}`, {
        signal,
      }),
    );
  }
  async create(body: object, signal?: AbortSignal): Promise<OwnerResult> {
    return owner(
      await this.client.apiAuthenticated('listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
    );
  }
  async update(
    listingId: string,
    etag: string,
    body: object,
  ): Promise<OwnerResult> {
    return owner(
      await this.client.apiAuthenticated(`me/listings/${id(listingId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': etag },
        body: JSON.stringify(body),
      }),
    );
  }
  async action(
    listingId: string,
    etag: string,
    action: 'submit' | 'archive' | 'mark-sold',
  ): Promise<OwnerResult> {
    return owner(
      await this.client.apiAuthenticated(
        `me/listings/${id(listingId)}/${action}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'if-match': etag },
          body: '{}',
        },
      ),
    );
  }
}
