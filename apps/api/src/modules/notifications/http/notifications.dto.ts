import { Transform } from 'class-transformer';
import {
  IsBoolean,
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
const boolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class NotificationListQuery {
  @ApiPropertyOptional({ default: false })
  @Transform(boolean)
  @IsBoolean()
  unreadOnly = false;

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

export class NotificationResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    enum: [
      'MODERATION_RESULT',
      'ACCOUNT_STATUS_CHANGED',
      'SAVED_SEARCH_MATCH',
      'FAVORITE_LISTING_STATUS_CHANGED',
    ],
    description: 'Unknown legacy/future types use the generic safe fallback.',
  })
  type!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readAt!: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    },
    description:
      'Type-specific allowlisted payload; never contains exact coordinates, private moderation data, or arbitrary URLs.',
  })
  content!: Record<string, string | number | boolean>;
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: false,
    required: ['kind', 'id'],
    properties: {
      kind: { type: 'string', enum: ['LISTING'] },
      id: { type: 'string', format: 'uuid' },
    },
  })
  target!: { kind: 'LISTING'; id: string } | null;
}

export class NotificationListResponse {
  @ApiProperty({ type: [NotificationResponse] }) items!: NotificationResponse[];
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

export class NotificationUnreadResponse {
  @ApiProperty({ minimum: 0 }) count!: number;
}
