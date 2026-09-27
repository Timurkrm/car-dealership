import type { VehicleRecord } from '../../vehicles';
import type { PartRecord } from '../../parts';
import type { LocationRecord } from '../../geo';
import type { Listing } from '../infrastructure/persistence/listing.entity';
import type {
  OwnerListingResponse,
  OwnerListingSummary,
  PublicListingSummary,
  PublicListingResponse,
  PublicVehicleResponse,
  OwnerVehicleResponse,
  PublicLocationResponse,
  OwnerLocationResponse,
} from '../http/listing.dto';

function vehiclePublic(vehicle: VehicleRecord): PublicVehicleResponse {
  return {
    id: vehicle.id,
    make: { id: vehicle.model.make.id, name: vehicle.model.make.name },
    model: { id: vehicle.model.id, name: vehicle.model.name },
    generation: vehicle.generation
      ? {
          id: vehicle.generation.id,
          name: vehicle.generation.name,
          startYear: vehicle.generation.startYear,
          endYear: vehicle.generation.endYear,
        }
      : null,
    year: vehicle.year,
    mileageKm: vehicle.mileageKm,
    bodyType: vehicle.bodyType,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    driveType: vehicle.driveType,
    condition: vehicle.condition,
    enginePowerHp: vehicle.enginePowerHp,
    engineDisplacementCc: vehicle.engineDisplacementCc,
    color: vehicle.color,
  };
}
export function locationPublic(
  location: LocationRecord | undefined,
): PublicLocationResponse | null {
  return location
    ? {
        city: location.city,
        region: location.region,
        countryCode: location.countryCode,
        publicPoint: location.publicPoint
          ? {
              latitude: location.publicPoint.coordinates[1],
              longitude: location.publicPoint.coordinates[0],
            }
          : null,
      }
    : null;
}
export function common(listing: Listing) {
  return {
    id: listing.id,
    title: listing.title,
    price: { amountMinor: listing.priceMinor, currency: listing.currency },
    status: listing.status,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    soldAt: listing.soldAt?.toISOString() ?? null,
  };
}
export function mapPublicListingSummary(
  listing: Listing,
  vehicle: VehicleRecord,
  location: LocationRecord | undefined,
  seller: { id: string; displayName: string },
): PublicListingSummary {
  return {
    ...common(listing),
    type: 'VEHICLE',
    cover: null,
    vehicle: vehiclePublic(vehicle),
    location: locationPublic(location),
    seller: { id: seller.id, displayName: seller.displayName },
  };
}
export function mapPublicListing(
  listing: Listing,
  vehicle: VehicleRecord,
  location: LocationRecord | undefined,
  seller: { id: string; displayName: string },
): PublicListingResponse {
  return {
    ...mapPublicListingSummary(listing, vehicle, location, seller),
    media: [],
    description: listing.description,
  };
}
export function mapOwnerListingSummary(
  listing: Listing,
  vehicle: VehicleRecord,
  location: LocationRecord | undefined,
): OwnerListingSummary {
  return {
    ...common(listing),
    type: 'VEHICLE',
    cover: null,
    vehicle: vehiclePublic(vehicle),
    location: locationPublic(location),
    version: listing.version,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    submittedAt: listing.submittedAt?.toISOString() ?? null,
    archivedAt: listing.archivedAt?.toISOString() ?? null,
  };
}

export function partSummary(part: PartRecord, quantityAvailable: number) {
  return {
    name: part.name,
    category: {
      id: part.category.id,
      name: part.category.name,
      parentId: part.category.parentId,
    },
    brand: part.brand ? { id: part.brand.id, name: part.brand.name } : null,
    condition: part.condition,
    quantityAvailable,
    fitment: { mode: part.fitmentMode, count: part.fitmentCount },
  };
}
export function partDetail(part: PartRecord, quantityAvailable: number) {
  const {
    name,
    category,
    brand,
    condition,
    quantityAvailable: quantity,
  } = partSummary(part, quantityAvailable);
  const summary = {
    name,
    category,
    brand,
    condition,
    quantityAvailable: quantity,
  };
  return {
    ...summary,
    manufacturerPartNumber: part.manufacturerPartNumber,
    oemNumber: part.oemNumber,
    fitmentMode: part.fitmentMode,
    fitments: part.fitments.map((row) => ({
      make: row.make,
      model: row.model,
      generation: row.generation,
      yearFrom: row.yearFrom ?? null,
      yearTo: row.yearTo ?? null,
    })),
  };
}
export function ownerPartSummary(
  listing: Listing,
  part: PartRecord,
  quantity: number,
  location: LocationRecord | undefined,
) {
  return {
    ...common(listing),
    type: 'PART' as const,
    cover: null,
    part: partSummary(part, quantity),
    location: locationPublic(location),
    version: listing.version,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    submittedAt: listing.submittedAt?.toISOString() ?? null,
    archivedAt: listing.archivedAt?.toISOString() ?? null,
  };
}
export function ownerPartDetail(
  listing: Listing,
  part: PartRecord,
  quantity: number,
  location: LocationRecord | undefined,
) {
  const publicLocation = locationPublic(location);
  return {
    ...ownerPartSummary(listing, part, quantity, location),
    description: listing.description,
    media: [],
    part: partDetail(part, quantity),
    location:
      location && publicLocation
        ? {
            ...publicLocation,
            exactPoint: {
              latitude: location.point.coordinates[1],
              longitude: location.point.coordinates[0],
            },
          }
        : null,
  };
}
export function mapOwnerListing(
  listing: Listing,
  vehicle: VehicleRecord,
  location: LocationRecord | undefined,
): OwnerListingResponse {
  const ownerVehicle: OwnerVehicleResponse = {
    ...vehiclePublic(vehicle),
    vin: vehicle.vin,
  };
  const publicLocation = locationPublic(location);
  const ownerLocation: OwnerLocationResponse | null =
    location && publicLocation
      ? {
          ...publicLocation,
          exactPoint: {
            latitude: location.point.coordinates[1],
            longitude: location.point.coordinates[0],
          },
        }
      : null;
  return {
    ...mapOwnerListingSummary(listing, vehicle, location),
    media: [],
    description: listing.description,
    vehicle: ownerVehicle,
    location: ownerLocation,
  };
}
