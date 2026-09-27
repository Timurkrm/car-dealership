import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  IsInt,
  ValidateIf,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PART_CONDITIONS, FITMENT_MODES } from '../domain/part.types';
import type { PartCondition, FitmentMode } from '../domain/part.types';

export class FitmentVehicleInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() modelId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((_object, value: unknown) => value != null)
  @IsUUID()
  generationId?: string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1886,
    maximum: 2100,
  })
  @ValidateIf((_object, value: unknown) => value != null)
  @IsInt()
  @Min(1886)
  @Max(2100)
  yearFrom?: number | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1886,
    maximum: 2100,
  })
  @ValidateIf((_object, value: unknown) => value != null)
  @IsInt()
  @Min(1886)
  @Max(2100)
  yearTo?: number | null;
}
export class PartFitmentInput {
  @ApiProperty({ enum: FITMENT_MODES }) @IsIn(FITMENT_MODES) mode!: FitmentMode;
  @ApiProperty({
    type: [FitmentVehicleInput],
    maxItems: 50,
    description:
      'UNIVERSAL requires []; VEHICLE_SPECIFIC may be incomplete in draft, but requires entries for submit.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FitmentVehicleInput)
  vehicles!: FitmentVehicleInput[];
}
export class PartInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() categoryId!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value != null)
  @IsUUID()
  brandId?: string | null;
  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  @Matches(/^[^\p{Cc}\p{Cs}]+$/u)
  name!: string;
  @ApiProperty({ enum: PART_CONDITIONS })
  @IsIn(PART_CONDITIONS)
  condition!: PartCondition;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
    description:
      'Trimmed uppercase exact number; separators preserved; public.',
  })
  @ValidateIf((_object, value: unknown) => value != null)
  @IsString()
  @MaxLength(100)
  manufacturerPartNumber?: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
    description:
      'Trimmed uppercase exact OEM number; public, not globally unique.',
  })
  @ValidateIf((_object, value: unknown) => value != null)
  @IsString()
  @MaxLength(100)
  oemNumber?: string | null;
  @ApiProperty({ type: PartFitmentInput })
  @IsObject()
  @ValidateNested()
  @Type(() => PartFitmentInput)
  fitment!: PartFitmentInput;
}
export class PartPatch extends PartialType(PartInput, {
  skipNullProperties: false,
}) {}
