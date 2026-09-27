import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  LISTING_REJECTION_REASONS,
  MODERATION_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_RESOLUTIONS,
  REPORT_STATUSES,
} from '../domain/moderation.types';
import type {
  ListingRejectionReason,
  ModerationTargetType,
  ReportReason,
  ReportResolution,
  ReportStatus,
} from '../domain/moderation.types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;
const plainText = /^(?:[^\p{Cc}\p{Cs}]|[\n\t])*$/u;

export class ModerationListingQuery {
  @ApiPropertyOptional({ enum: ['VEHICLE', 'PART'] })
  @IsOptional()
  @IsIn(['VEHICLE', 'PART'])
  type?: 'VEHICLE' | 'PART';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  sellerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  listingId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  submittedFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  submittedTo?: string;

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

export class RejectListingInput {
  @ApiProperty({ enum: LISTING_REJECTION_REASONS })
  @IsIn(LISTING_REJECTION_REASONS)
  reasonCode!: ListingRejectionReason;

  @ApiProperty({
    minLength: 1,
    maxLength: 2000,
    description: 'Seller-visible plain text.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  @Matches(plainText)
  sellerMessage!: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Internal plain text; never seller/public.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  @Matches(plainText)
  internalNote?: string;
}

export class RemoveListingInput extends RejectListingInput {}

export class CreateReportInput {
  @ApiProperty({ enum: MODERATION_TARGET_TYPES })
  @IsIn(MODERATION_TARGET_TYPES)
  targetType!: ModerationTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  targetId!: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Optional plain-text context.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  @Matches(plainText)
  details?: string;
}

export class ReportQueueQuery {
  @ApiPropertyOptional({ enum: REPORT_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status: ReportStatus = 'OPEN';

  @ApiPropertyOptional({ enum: MODERATION_TARGET_TYPES })
  @IsOptional()
  @IsIn(MODERATION_TARGET_TYPES)
  targetType?: ModerationTargetType;

  @ApiPropertyOptional({ enum: REPORT_REASONS })
  @IsOptional()
  @IsIn(REPORT_REASONS)
  reason?: ReportReason;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

export class ResolveReportInput {
  @ApiProperty({ enum: ['RESOLVED', 'DISMISSED'] })
  @IsIn(['RESOLVED', 'DISMISSED'])
  outcome!: 'RESOLVED' | 'DISMISSED';

  @ApiProperty({ enum: REPORT_RESOLUTIONS })
  @IsIn(REPORT_RESOLUTIONS)
  resolution!: ReportResolution;

  @ApiPropertyOptional({ maxLength: 2000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  @Matches(plainText)
  note?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Required for CONTENT_REMOVED.',
  })
  @ValidateIf(
    (input: ResolveReportInput) => input.resolution === 'CONTENT_REMOVED',
  )
  @IsInt()
  @Min(1)
  targetVersion?: number;
}
