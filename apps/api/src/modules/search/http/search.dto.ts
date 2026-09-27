import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { ImageVariantResponse } from '../../listings';

export class SearchNamedValue {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}
export class SearchPrice {
  @ApiProperty({ description: 'Canonical int64 decimal string, minor units.' })
  amountMinor!: string;
  @ApiProperty() currency!: string;
}
export class SearchPoint {
  @ApiProperty({ minimum: -90, maximum: 90 }) latitude!: number;
  @ApiProperty({ minimum: -180, maximum: 180 }) longitude!: number;
}
export class SearchVehicle {
  @ApiProperty({ type: SearchNamedValue }) make!: SearchNamedValue;
  @ApiProperty({ type: SearchNamedValue }) model!: SearchNamedValue;
  @ApiProperty({ type: SearchNamedValue, nullable: true })
  generation!: SearchNamedValue | null;
  @ApiProperty() year!: number;
  @ApiProperty() mileageKm!: number;
  @ApiProperty() bodyType!: string;
  @ApiProperty() fuelType!: string;
  @ApiProperty() transmission!: string;
  @ApiProperty() driveType!: string;
  @ApiProperty() condition!: string;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
}
export class SearchFitmentSample {
  @ApiProperty({ type: SearchNamedValue }) make!: SearchNamedValue;
  @ApiProperty({ type: SearchNamedValue }) model!: SearchNamedValue;
  @ApiProperty({ type: SearchNamedValue, nullable: true })
  generation!: SearchNamedValue | null;
  @ApiProperty({ type: Number, nullable: true }) yearFrom!: number | null;
  @ApiProperty({ type: Number, nullable: true }) yearTo!: number | null;
}
export class SearchPartFitment {
  @ApiProperty({ enum: ['UNIVERSAL', 'VEHICLE_SPECIFIC'] }) mode!: string;
  @ApiProperty({ minimum: 0, maximum: 50 }) count!: number;
  @ApiProperty({ type: [SearchFitmentSample], maxItems: 3 })
  samples!: SearchFitmentSample[];
}
export class SearchPart {
  @ApiProperty() name!: string;
  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      parentId: { type: 'string', format: 'uuid', nullable: true },
    },
  })
  category!: SearchNamedValue & { parentId: string | null };
  @ApiProperty({ type: SearchNamedValue, nullable: true })
  brand!: SearchNamedValue | null;
  @ApiProperty({ enum: ['NEW', 'USED', 'REFURBISHED', 'FOR_PARTS'] })
  condition!: string;
  @ApiProperty({ type: String, nullable: true })
  manufacturerPartNumber!: string | null;
  @ApiProperty({ type: String, nullable: true }) oemNumber!: string | null;
  @ApiProperty({ minimum: 1, maximum: 1000000 }) quantityAvailable!: number;
  @ApiProperty({ type: SearchPartFitment }) fitment!: SearchPartFitment;
}
export class SearchLocation {
  @ApiProperty() city!: string;
  @ApiProperty({ type: String, nullable: true }) region!: string | null;
  @ApiProperty() countryCode!: string;
  @ApiProperty({
    type: SearchPoint,
    nullable: true,
    description: 'Independent public coordinate only; never exact fallback.',
  })
  publicPoint!: SearchPoint | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Kilometre buckets; 0 means <1 km. Null without origin.',
  })
  distanceMeters!: number | null;
}
class SearchItemBase {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: SearchPrice }) price!: SearchPrice;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty({ type: ImageVariantResponse }) cover!: ImageVariantResponse;
  @ApiProperty({ type: SearchLocation, nullable: true })
  location!: SearchLocation | null;
}
export class VehicleSearchItem extends SearchItemBase {
  @ApiProperty({ enum: ['VEHICLE'] }) type!: 'VEHICLE';
  @ApiProperty({ type: SearchVehicle }) vehicle!: SearchVehicle;
}
export class PartSearchItem extends SearchItemBase {
  @ApiProperty({ enum: ['PART'] }) type!: 'PART';
  @ApiProperty({ type: SearchPart }) part!: SearchPart;
}
export class SearchPage {
  @ApiProperty() hasNextPage!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Opaque authenticated cursor bound to search schema v2; expires after 24 hours.',
  })
  nextCursor!: string | null;
}
export class SearchResponse {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(VehicleSearchItem) },
        { $ref: getSchemaPath(PartSearchItem) },
      ],
      discriminator: { propertyName: 'type' },
    },
  })
  items!: (VehicleSearchItem | PartSearchItem)[];
  @ApiProperty({ type: SearchPage }) page!: SearchPage;
}
class MapItemBase {
  @ApiProperty({ enum: ['LISTING'] }) kind!: 'LISTING';
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: SearchPoint }) publicPoint!: SearchPoint;
  @ApiProperty({ type: SearchPrice }) price!: SearchPrice;
  @ApiProperty({ type: ImageVariantResponse }) cover!: ImageVariantResponse;
  @ApiProperty({
    type: 'object',
    properties: {
      city: { type: 'string' },
      region: { type: 'string', nullable: true },
      countryCode: { type: 'string' },
      distanceMeters: { type: 'number', nullable: true },
    },
  })
  location!: {
    city: string;
    region: string | null;
    countryCode: string;
    distanceMeters: number | null;
  };
}
export class VehicleMapItem extends MapItemBase {
  @ApiProperty({ enum: ['VEHICLE'] }) type!: 'VEHICLE';
  @ApiProperty({
    type: 'object',
    properties: {
      make: { type: 'string' },
      model: { type: 'string' },
      year: { type: 'integer' },
      mileageKm: { type: 'integer' },
    },
  })
  vehicle!: { make: string; model: string; year: number; mileageKm: number };
}
export class PartMapItem extends MapItemBase {
  @ApiProperty({ enum: ['PART'] }) type!: 'PART';
  @ApiProperty({
    type: 'object',
    properties: {
      name: { type: 'string' },
      category: { type: 'string' },
      brand: { type: 'string', nullable: true },
      condition: { type: 'string' },
      fitment: {
        type: 'object',
        properties: {
          mode: { type: 'string' },
          count: { type: 'integer' },
        },
      },
    },
  })
  part!: {
    name: string;
    category: string;
    brand: string | null;
    condition: string;
    fitment: { mode: string; count: number };
  };
}
export class MapBounds {
  @ApiProperty({ minimum: -180, maximum: 180 }) west!: number;
  @ApiProperty({ minimum: -90, maximum: 90 }) south!: number;
  @ApiProperty({ minimum: -180, maximum: 180 }) east!: number;
  @ApiProperty({ minimum: -90, maximum: 90 }) north!: number;
}
export class ClusterMapFeature {
  @ApiProperty({ enum: ['CLUSTER'] }) kind!: 'CLUSTER';
  @ApiProperty({ description: 'Ephemeral zoom/grid identifier.' })
  clusterId!: string;
  @ApiProperty({ type: SearchPoint }) center!: SearchPoint;
  @ApiProperty({ minimum: 2 }) count!: number;
  @ApiProperty({ type: MapBounds }) bounds!: MapBounds;
}
export class MapResponse {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(VehicleMapItem) },
        { $ref: getSchemaPath(PartMapItem) },
        { $ref: getSchemaPath(ClusterMapFeature) },
      ],
    },
    description:
      'Bounded server-clustered projection derived only from publicPoint.',
  })
  features!: (VehicleMapItem | PartMapItem | ClusterMapFeature)[];
  @ApiProperty() truncated!: boolean;
  @ApiProperty() limit!: number;
}
export class FacetCount {
  @ApiProperty() value!: string;
  @ApiProperty() count!: number;
}
export class VehicleFacets {
  @ApiProperty({ type: [FacetCount] }) make!: FacetCount[];
  @ApiProperty({ type: [FacetCount] }) bodyType!: FacetCount[];
  @ApiProperty({ type: [FacetCount] }) fuelType!: FacetCount[];
  @ApiProperty({ type: [FacetCount] }) transmission!: FacetCount[];
}
export class PartFacets {
  @ApiProperty({ type: [FacetCount] }) category!: FacetCount[];
  @ApiProperty({ type: [FacetCount] }) brand!: FacetCount[];
  @ApiProperty({ type: [FacetCount] }) condition!: FacetCount[];
}
export class FacetResponse {
  @ApiProperty({ enum: ['VEHICLE', 'PART'] }) type!: 'VEHICLE' | 'PART';
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(VehicleFacets) },
      { $ref: getSchemaPath(PartFacets) },
    ],
  })
  facets!: VehicleFacets | PartFacets;
  @ApiProperty() truncated!: boolean;
  @ApiProperty({ enum: ['after_all_filters'] }) semantics!: string;
}
