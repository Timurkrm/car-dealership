import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { VehicleInput, VehiclePatch } from '../../vehicles';
import type { OwnerPartListingSummary } from './part-listing.dto';
import { PageQuery } from '../../../platform/http/page.dto';
import { LISTING_STATUSES } from '../domain/listing.types';
import type { ListingStatus } from '../domain/listing.types';
import {
  ListingImageResponse,
  ImageVariantResponse,
} from '../application/listing-media.port';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
import { SUPPORTED_CURRENCIES } from '../domain/listing-price';
export class PriceInput {
  @ApiProperty({
    type: String,
    pattern: '^[1-9][0-9]{0,18}$',
    example: '2500000',
    description:
      'Positive int64 minor units, decimal string. JPY exponent 0; other supported currencies 2.',
  })
  @IsString()
  @Matches(/^[1-9][0-9]{0,18}$/)
  amountMinor!: string;
  @ApiProperty({ enum: SUPPORTED_CURRENCIES, example: 'EUR' })
  @Transform(upper)
  @IsIn(SUPPORTED_CURRENCIES)
  currency!: string;
}
export class ListingFieldsInput {
  @ApiProperty({ minLength: 1, maxLength: 200, example: 'BMW 3 Series 2022' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  @Matches(/^[^\p{Cc}]+$/u)
  title!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 20000,
    description: 'Plain text; render as escaped text.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value,
  )
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(20000)
  @Matches(/^(?:[^\p{Cc}\p{Cs}]|[\n\t])*$/u, {
    message: 'Invalid text',
  })
  description?: string | null;
  @ApiProperty({ type: PriceInput })
  @IsObject()
  @ValidateNested()
  @Type(() => PriceInput)
  price!: PriceInput;
}
export class ListingFieldsPatch extends PartialType(ListingFieldsInput, {
  skipNullProperties: false,
}) {}
export class PointInput {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;
  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}
export class LocationInput extends PointInput {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  @Matches(/^[^\p{Cc}]+$/u)
  city!: string;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @Transform(trim)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Length(1, 120)
  @Matches(/^[^\p{Cc}]+$/u)
  region?: string | null;
  @ApiProperty({
    pattern: '^[A-Z]{2}$',
    description:
      'Uppercase two-letter country code format; membership is not validated.',
  })
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
  @ApiPropertyOptional({
    type: PointInput,
    nullable: true,
    description:
      'Independently chosen public coordinate. Omitted/null never copies exact point.',
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsObject()
  @ValidateNested()
  @Type(() => PointInput)
  publicPoint?: PointInput | null;
}
export class CreateListingInput {
  @ApiProperty({ type: VehicleInput })
  @IsObject()
  @ValidateNested()
  @Type(() => VehicleInput)
  vehicle!: VehicleInput;
  @ApiProperty({ type: ListingFieldsInput })
  @IsObject()
  @ValidateNested()
  @Type(() => ListingFieldsInput)
  listing!: ListingFieldsInput;
  @ApiPropertyOptional({ type: LocationInput, nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsObject()
  @ValidateNested()
  @Type(() => LocationInput)
  location?: LocationInput | null;
}
export class UpdateListingInput {
  @ApiPropertyOptional({ type: VehiclePatch })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => VehiclePatch)
  vehicle?: VehiclePatch;
  @ApiPropertyOptional({ type: ListingFieldsPatch })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => ListingFieldsPatch)
  listing?: ListingFieldsPatch;
  @ApiPropertyOptional({
    type: LocationInput,
    nullable: true,
    description: 'Full replacement; null removes draft location.',
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsObject()
  @ValidateNested()
  @Type(() => LocationInput)
  location?: LocationInput | null;
}
export class SellerListQuery extends PageQuery {
  @ApiPropertyOptional({
    enum: ['VEHICLE', 'PART'],
    description: 'Omitted returns both types.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['VEHICLE', 'PART'])
  type?: 'VEHICLE' | 'PART';
  @ApiPropertyOptional({ enum: LISTING_STATUSES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(LISTING_STATUSES)
  status?: ListingStatus;
  @ApiPropertyOptional({
    enum: ['created_newest', 'updated_newest'],
    default: 'created_newest',
  })
  @IsIn(['created_newest', 'updated_newest'])
  sort: 'created_newest' | 'updated_newest' = 'created_newest';
}
export class CatalogNameResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}
export class GenerationResponse extends CatalogNameResponse {
  @ApiProperty() startYear!: number;
  @ApiProperty({ type: Number, nullable: true }) endYear!: number | null;
}
export class PublicVehicleResponse extends OmitType(VehicleInput, [
  'vin',
  'modelId',
  'generationId',
] as const) {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: CatalogNameResponse }) make!: CatalogNameResponse;
  @ApiProperty({ type: CatalogNameResponse }) model!: CatalogNameResponse;
  @ApiProperty({ type: GenerationResponse, nullable: true })
  generation!: GenerationResponse | null;
}
export class OwnerVehicleResponse extends PublicVehicleResponse {
  @ApiProperty({ type: String, nullable: true }) vin!: string | null;
}
export class PublicLocationResponse {
  @ApiProperty() city!: string;
  @ApiProperty({ type: String, nullable: true }) region!: string | null;
  @ApiProperty() countryCode!: string;
  @ApiProperty({ type: PointInput, nullable: true })
  publicPoint!: PointInput | null;
}
export class OwnerLocationResponse extends PublicLocationResponse {
  @ApiProperty({ type: PointInput }) exactPoint!: PointInput;
}
export class SellerResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}
export class PublicListingResponse {
  @ApiProperty({ enum: ['VEHICLE'] }) type!: 'VEHICLE';
  @ApiProperty({ type: ImageVariantResponse, nullable: true })
  cover!: ImageVariantResponse | null;
  @ApiProperty({ type: [ListingImageResponse] }) media!: ListingImageResponse[];
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: PriceInput }) price!: PriceInput;
  @ApiProperty({ enum: ['PUBLISHED', 'SOLD'] }) status!: ListingStatus;
  @ApiProperty({ type: PublicVehicleResponse }) vehicle!: PublicVehicleResponse;
  @ApiProperty({ type: PublicLocationResponse, nullable: true })
  location!: PublicLocationResponse | null;
  @ApiProperty({ type: SellerResponse }) seller!: SellerResponse;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) soldAt!:
    string | null;
}
export class OwnerListingResponse extends OmitType(PublicListingResponse, [
  'vehicle',
  'location',
  'seller',
  'status',
] as const) {
  @ApiProperty({ enum: LISTING_STATUSES }) status!: ListingStatus;
  @ApiProperty({ type: OwnerVehicleResponse }) vehicle!: OwnerVehicleResponse;
  @ApiProperty({ type: OwnerLocationResponse, nullable: true })
  location!: OwnerLocationResponse | null;
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt!: string | null;
}
export class PublicListingSummary extends OmitType(PublicListingResponse, [
  'description',
  'media',
] as const) {}
export class OwnerListingSummary extends OmitType(OwnerListingResponse, [
  'description',
  'vehicle',
  'location',
  'media',
] as const) {
  @ApiProperty({ type: PublicVehicleResponse }) vehicle!: PublicVehicleResponse;
  @ApiProperty({ type: PublicLocationResponse, nullable: true })
  location!: PublicLocationResponse | null;
}
export class OwnerListingPage {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: '#/components/schemas/OwnerListingSummary' },
        { $ref: '#/components/schemas/OwnerPartListingSummary' },
      ],
      discriminator: { propertyName: 'type' },
    },
  })
  items!: (OwnerListingSummary | OwnerPartListingSummary)[];
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty() hasMore!: boolean;
}
