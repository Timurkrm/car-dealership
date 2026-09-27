import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;

export class FavoriteListQuery {
  @ApiPropertyOptional({ enum: ['VEHICLE', 'PART'] })
  @IsOptional()
  @IsIn(['VEHICLE', 'PART'])
  type?: 'VEHICLE' | 'PART';

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({
    maxLength: 2048,
    description: 'Opaque signed cursor.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

export class FavoriteMutationResponse {
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty({ enum: ['VEHICLE', 'PART'] }) type!: 'VEHICLE' | 'PART';
  @ApiProperty({ example: true }) favorite!: true;
}

export class FavoriteListResponse {
  @ApiProperty({
    description:
      'Mixed compact VEHICLE/PART cards or a content-free UNAVAILABLE tombstone.',
    type: 'array',
    items: {
      oneOf: [
        {
          type: 'object',
          required: [
            'kind',
            'listingId',
            'title',
            'availability',
            'price',
            'cover',
            'addedAt',
          ],
          properties: {
            kind: { type: 'string', enum: ['VEHICLE', 'PART'] },
            listingId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            availability: { type: 'string', enum: ['AVAILABLE', 'SOLD'] },
            price: { type: 'object' },
            cover: { type: 'object' },
            addedAt: { type: 'string', format: 'date-time' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'listingId', 'availability', 'addedAt'],
          properties: {
            kind: { type: 'string', enum: ['UNAVAILABLE'] },
            listingId: { type: 'string', format: 'uuid' },
            availability: { type: 'string', enum: ['UNAVAILABLE'] },
            addedAt: { type: 'string', format: 'date-time' },
          },
        },
      ],
    },
  })
  items!: unknown[];

  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    required: ['hasNextPage', 'nextCursor'],
    properties: {
      hasNextPage: { type: 'boolean' },
      nextCursor: { type: 'string', nullable: true },
    },
  })
  page!: { hasNextPage: boolean; nextCursor: string | null };
}
