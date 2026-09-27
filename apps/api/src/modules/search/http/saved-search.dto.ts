import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const plainText = /^[^\p{Cc}\p{Cs}]+$/u;

export class CreateSavedSearchInput {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  @Matches(plainText)
  name!: string;

  @ApiProperty({ enum: ['VEHICLE', 'PART'] })
  @IsIn(['VEHICLE', 'PART'])
  type!: 'VEHICLE' | 'PART';

  @ApiProperty({
    description:
      'Search-v2 query values without type, sort, cursor, limit or private lat/lng origin.',
    oneOf: [
      {
        title: 'Vehicle saved filters',
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          [
            'makeId',
            'modelId',
            'generationId',
            'yearFrom',
            'yearTo',
            'priceFromMinor',
            'priceToMinor',
            'currency',
            'mileageFrom',
            'mileageTo',
            'bodyType',
            'fuelType',
            'transmission',
            'driveType',
            'condition',
            'color',
            'bbox',
          ].map((key) => [key, { type: 'string' }]),
        ),
      },
      {
        title: 'Part saved filters',
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          [
            'categoryId',
            'includeSubcategories',
            'brandId',
            'condition',
            'oemNumber',
            'manufacturerPartNumber',
            'partNumber',
            'compatibleMakeId',
            'compatibleModelId',
            'compatibleGenerationId',
            'compatibleYear',
            'fitmentMode',
            'includeUniversal',
            'priceFromMinor',
            'priceToMinor',
            'currency',
            'bbox',
          ].map((key) => [key, { type: 'string' }]),
        ),
      },
    ],
  })
  @IsObject()
  filters!: Record<string, unknown>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled = false;
}

export class UpdateSavedSearchInput {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(plainText)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}

export class SavedSearchResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['VEHICLE', 'PART'] }) type!: 'VEHICLE' | 'PART';
  @ApiProperty({ example: 2 }) schemaVersion!: number;
  @ApiProperty() supported!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  filters!: Record<string, string>;
  @ApiProperty() notificationsEnabled!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class SavedSearchListResponse {
  @ApiProperty({ type: [SavedSearchResponse] }) items!: SavedSearchResponse[];
  @ApiProperty() limit!: number;
}
