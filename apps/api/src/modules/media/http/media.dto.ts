import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsIn,
  IsInt,
  Min,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsUUID,
} from 'class-validator';
import { IMAGE_TYPES } from '../domain/media-policy';
import { ListingImageResponse } from '../../listings';
export class InitializeMediaInput {
  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Optional display name; never stored or used as a key',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
  @ApiProperty({ enum: IMAGE_TYPES }) @IsIn(IMAGE_TYPES) contentType!: string;
  @ApiProperty({
    minimum: 1,
    description: 'Declared size; actual object size is checked independently',
  })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
export class MediaOrderInput {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: 30,
    description: 'Every active photo exactly once',
  })
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  mediaIds!: string[];
}
export class UploadAuthorization {
  @ApiProperty({ enum: ['PUT'] }) method!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  headers!: Record<string, string>;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}
export class InitializeMediaResponse {
  @ApiProperty({ format: 'uuid' }) mediaId!: string;
  @ApiProperty({ type: UploadAuthorization }) upload!: UploadAuthorization;
}
export class MediaLimitsResponse {
  @ApiProperty() maxImages!: number;
  @ApiProperty() maxFileSize!: number;
  @ApiProperty({ type: [String] }) supportedTypes!: string[];
}
export class MediaListResponse {
  @ApiProperty({ type: [ListingImageResponse] }) items!: ListingImageResponse[];
  @ApiProperty({ type: MediaLimitsResponse }) limits!: MediaLimitsResponse;
}
