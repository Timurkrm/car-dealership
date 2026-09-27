import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  PartInput,
  PartPatch,
  PART_CONDITIONS,
  FITMENT_MODES,
} from '../../parts';
import type { PartCondition, FitmentMode } from '../../parts';
import {
  CreateListingInput,
  UpdateListingInput,
  PublicListingResponse,
  OwnerListingResponse,
  OwnerListingSummary,
  CatalogNameResponse,
} from './listing.dto';

export class CreatePartListingInput extends OmitType(CreateListingInput, [
  'vehicle',
] as const) {
  @ApiProperty({ type: PartInput })
  @IsObject()
  @ValidateNested()
  @Type(() => PartInput)
  part!: PartInput;
  @ApiProperty({ minimum: 1, maximum: 1000000, default: 1 })
  @IsInt()
  @Min(1)
  @Max(1000000)
  quantityAvailable = 1;
}
export class UpdatePartListingInput extends OmitType(UpdateListingInput, [
  'vehicle',
] as const) {
  @ApiPropertyOptional({ type: PartPatch })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PartPatch)
  part?: PartPatch;
  @ApiPropertyOptional({ minimum: 1, maximum: 1000000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000000)
  quantityAvailable?: number;
}
export class PartCategoryNameResponse extends CatalogNameResponse {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) parentId!:
    string | null;
}
export class PublicFitmentResponse {
  @ApiProperty({ type: CatalogNameResponse }) make!: CatalogNameResponse;
  @ApiProperty({ type: CatalogNameResponse }) model!: CatalogNameResponse;
  @ApiProperty({
    type: CatalogNameResponse,
    nullable: true,
    description:
      'null means all generations of the model, within optional year bounds.',
  })
  generation!: CatalogNameResponse | null;
  @ApiProperty({ type: Number, nullable: true }) yearFrom!: number | null;
  @ApiProperty({ type: Number, nullable: true }) yearTo!: number | null;
}
export class PartFitmentSummaryResponse {
  @ApiProperty({ enum: FITMENT_MODES }) mode!: FitmentMode;
  @ApiProperty({ minimum: 0, maximum: 50 }) count!: number;
}
export class PublicPartSummaryResponse {
  @ApiProperty() name!: string;
  @ApiProperty({ type: PartCategoryNameResponse })
  category!: PartCategoryNameResponse;
  @ApiProperty({ type: CatalogNameResponse, nullable: true })
  brand!: CatalogNameResponse | null;
  @ApiProperty({ enum: PART_CONDITIONS }) condition!: PartCondition;
  @ApiProperty({
    minimum: 0,
    maximum: 1000000,
    description:
      'Price is per unit; SOLD closes the offer and sets quantity to zero.',
  })
  quantityAvailable!: number;
  @ApiProperty({ type: PartFitmentSummaryResponse })
  fitment!: PartFitmentSummaryResponse;
}
export class PublicPartResponse extends OmitType(PublicPartSummaryResponse, [
  'fitment',
] as const) {
  @ApiProperty({ type: String, nullable: true }) manufacturerPartNumber!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) oemNumber!: string | null;
  @ApiProperty({ enum: FITMENT_MODES }) fitmentMode!: FitmentMode;
  @ApiProperty({
    type: [PublicFitmentResponse],
    maxItems: 50,
    description:
      'Compatibility stated by the seller; not automatic verification.',
  })
  fitments!: PublicFitmentResponse[];
}
export class PublicPartListingResponse extends OmitType(PublicListingResponse, [
  'vehicle',
  'type',
] as const) {
  @ApiProperty({ enum: ['PART'] }) type!: 'PART';
  @ApiProperty({ type: PublicPartResponse }) part!: PublicPartResponse;
}
export class OwnerPartListingResponse extends OmitType(OwnerListingResponse, [
  'vehicle',
  'type',
] as const) {
  @ApiProperty({ enum: ['PART'] }) type!: 'PART';
  @ApiProperty({ type: PublicPartResponse }) part!: PublicPartResponse;
}
export class OwnerPartListingSummary extends OmitType(OwnerListingSummary, [
  'vehicle',
  'type',
] as const) {
  @ApiProperty({ enum: ['PART'] }) type!: 'PART';
  @ApiProperty({ type: PublicPartSummaryResponse })
  part!: PublicPartSummaryResponse;
}
export class PublicPartListingSummary extends OmitType(
  PublicPartListingResponse,
  ['part', 'description', 'media'] as const,
) {
  @ApiProperty({ type: PublicPartSummaryResponse })
  part!: PublicPartSummaryResponse;
}
export type MarketplaceOwner = OwnerListingResponse | OwnerPartListingResponse;
export type MarketplaceOwnerSummary =
  OwnerListingSummary | OwnerPartListingSummary;
export type MarketplacePublic =
  PublicListingResponse | PublicPartListingResponse;
