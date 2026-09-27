export const STATUSES = [
  'DRAFT',
  'PENDING_MODERATION',
  'PUBLISHED',
  'REJECTED',
  'SOLD',
  'ARCHIVED',
] as const;
export type ListingStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<ListingStatus, string> = {
  DRAFT: 'Черновик',
  PENDING_MODERATION: 'На модерации',
  PUBLISHED: 'Опубликовано',
  REJECTED: 'Отклонено',
  SOLD: 'Продано',
  ARCHIVED: 'В архиве',
};
export const SPEC_OPTIONS = {
  bodyType: [
    'SEDAN',
    'HATCHBACK',
    'SUV',
    'COUPE',
    'WAGON',
    'CONVERTIBLE',
    'VAN',
    'PICKUP',
    'OTHER',
  ],
  fuelType: [
    'PETROL',
    'DIESEL',
    'ELECTRIC',
    'HYBRID',
    'PLUG_IN_HYBRID',
    'LPG',
    'HYDROGEN',
    'OTHER',
  ],
  transmission: ['MANUAL', 'AUTOMATIC', 'OTHER'],
  driveType: ['FWD', 'RWD', 'AWD', 'OTHER'],
  condition: ['NEW', 'USED', 'DAMAGED'],
  color: [
    'BLACK',
    'WHITE',
    'GRAY',
    'SILVER',
    'BLUE',
    'RED',
    'GREEN',
    'BROWN',
    'BEIGE',
    'YELLOW',
    'ORANGE',
    'PURPLE',
    'OTHER',
  ],
} as const;
export const CURRENCIES = [
  'RUB',
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'CNY',
  'JPY',
] as const;
export interface CatalogItem {
  id: string;
  name: string;
  slug?: string;
}
export interface Generation extends CatalogItem {
  startYear: number;
  endYear: number | null;
}
export interface Point {
  latitude: number;
  longitude: number;
}
export interface PublicLocation {
  city: string;
  region: string | null;
  countryCode: string;
  publicPoint: Point | null;
}
export interface OwnerLocation extends PublicLocation {
  exactPoint: Point;
}
export interface Vehicle {
  id: string;
  make: CatalogItem;
  model: CatalogItem;
  generation: Generation | null;
  year: number;
  mileageKm: number;
  bodyType: string;
  fuelType: string;
  transmission: string;
  driveType: string;
  condition: string;
  enginePowerHp: number | null;
  engineDisplacementCc: number | null;
  color: string | null;
}
export interface ListingBase {
  cover?: import('../media/media-client').Variant | null;
  id: string;
  title: string;
  description: string | null;
  price: { amountMinor: string; currency: string };
  status: ListingStatus;
  publishedAt: string | null;
  soldAt: string | null;
}
export interface PublicListing extends ListingBase {
  type: 'VEHICLE';
  media?: import('../media/media-client').Photo[];
  vehicle: Vehicle;
  location: PublicLocation | null;
  seller: { id: string; displayName: string };
}
export interface OwnerListing extends ListingBase {
  type: 'VEHICLE';
  media?: import('../media/media-client').Photo[];
  vehicle: Vehicle & { vin: string | null };
  location: OwnerLocation | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  archivedAt: string | null;
}
export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  hasMore: boolean;
}
export interface OwnerResult {
  listing: MarketplaceOwner;
  etag: string;
}
export type PublicListingSummary = Omit<PublicListing, 'description'>;
export type OwnerListingSummary = Omit<
  OwnerListing,
  'description' | 'vehicle' | 'location'
> & {
  vehicle: Vehicle;
  location: PublicLocation | null;
};
export interface PartCategory extends CatalogItem {
  parentId: string | null;
}
export const PART_CONDITIONS = [
  'NEW',
  'USED',
  'REFURBISHED',
  'FOR_PARTS',
] as const;
export type PartCondition = (typeof PART_CONDITIONS)[number];
export type FitmentMode = 'UNIVERSAL' | 'VEHICLE_SPECIFIC';
export interface Fitment {
  make: CatalogItem;
  model: CatalogItem;
  generation: CatalogItem | null;
  yearFrom: number | null;
  yearTo: number | null;
}
export interface FitmentSelection {
  modelId: string;
  generationId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}
export interface PartSummary {
  name: string;
  category: PartCategory;
  brand: CatalogItem | null;
  condition: PartCondition;
  quantityAvailable: number;
  fitment: { mode: FitmentMode; count: number };
}
export interface PartDetail extends Omit<PartSummary, 'fitment'> {
  manufacturerPartNumber: string | null;
  oemNumber: string | null;
  fitmentMode: FitmentMode;
  fitments: Fitment[];
}
export interface PublicPartListing extends ListingBase {
  type: 'PART';
  part: PartDetail;
  location: PublicLocation | null;
  seller: { id: string; displayName: string };
  media?: import('../media/media-client').Photo[];
}
export interface OwnerPartListing extends Omit<
  OwnerListing,
  'type' | 'vehicle'
> {
  type: 'PART';
  part: PartDetail;
}
export interface OwnerPartSummary extends Omit<
  OwnerListingSummary,
  'type' | 'vehicle'
> {
  type: 'PART';
  part: PartSummary;
}
export interface PublicPartSummary extends Omit<
  PublicPartListing,
  'part' | 'description' | 'media'
> {
  part: PartSummary;
}
export type MarketplaceOwner = OwnerListing | OwnerPartListing;
export type MarketplaceOwnerSummary = OwnerListingSummary | OwnerPartSummary;
