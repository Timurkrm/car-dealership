import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const integer = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;

export class OpenConversationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  listingId!: string;
}

export class SendMessageDto {
  @ApiProperty({ format: 'uuid', description: 'Client-generated retry key.' })
  @IsUUID()
  clientMessageId!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 8000,
    description: 'Plain text only.',
  })
  @IsString()
  @MaxLength(8000)
  body!: string;
}

export class MessagePageQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @ApiPropertyOptional({
    maxLength: 2048,
    description: 'Opaque signed cursor for older messages.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

export class ConversationPageQuery {
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

export class MarkConversationReadDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  messageId!: string;
}

export class MessagingResponse {
  @ApiProperty({ type: 'object', additionalProperties: true })
  value!: unknown;
}

export class MessagingPageDto {
  @ApiProperty()
  hasNextPage!: boolean;

  @ApiProperty({ nullable: true, description: 'Opaque signed cursor.' })
  nextCursor!: string | null;
}

export class ConversationOpenedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty({
    description: 'False when an existing conversation was returned.',
  })
  created!: boolean;
}

export class MessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ format: 'uuid' })
  senderId!: string;

  @ApiProperty({ format: 'uuid' })
  clientMessageId!: string;

  @ApiProperty({
    nullable: true,
    description: 'Plain text; null for a deleted message.',
  })
  body!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  editedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  deletedAt!: string | null;
}

export class MessagingListingDto {
  @ApiPropertyOptional({ enum: ['VEHICLE', 'PART'] })
  type?: 'VEHICLE' | 'PART';

  @ApiPropertyOptional({ enum: ['UNAVAILABLE'] })
  kind?: 'UNAVAILABLE';

  @ApiProperty({ format: 'uuid' })
  listingId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ enum: ['PUBLISHED', 'SOLD'] })
  status?: 'PUBLISHED' | 'SOLD';

  @ApiPropertyOptional({
    type: 'object',
    properties: {
      amountMinor: { type: 'string' },
      currency: { type: 'string' },
    },
  })
  price?: { amountMinor: string; currency: string };

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  cover?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  location?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  vehicle?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  part?: Record<string, unknown>;
}

export class ConversationParticipantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class ConversationDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MessagingListingDto })
  listing!: MessagingListingDto;

  @ApiProperty({ type: [ConversationParticipantDto] })
  participants!: ConversationParticipantDto[];

  @ApiProperty({ format: 'uuid' })
  buyerId!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastMessageAt!: string | null;

  @ApiProperty({ description: 'False after moderator removal.' })
  canSend!: boolean;
}

export class ConversationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: MessagingListingDto })
  listing!: MessagingListingDto;

  @ApiProperty({ type: ConversationParticipantDto })
  otherParticipant!: ConversationParticipantDto;

  @ApiProperty({ type: () => InboxLastMessageDto, nullable: true })
  lastMessage!: InboxLastMessageDto | null;

  @ApiProperty({ minimum: 0 })
  unreadCount!: number;

  @ApiProperty({ format: 'date-time' })
  activityAt!: string;

  @ApiProperty({ description: 'False after moderator removal.' })
  canSend!: boolean;
}

export class InboxLastMessageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  senderId!: string;

  @ApiProperty({ nullable: true })
  body!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ConversationListResponseDto {
  @ApiProperty({ type: [ConversationSummaryDto] })
  items!: ConversationSummaryDto[];

  @ApiProperty({ type: MessagingPageDto })
  page!: MessagingPageDto;
}

export class MessageListResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  items!: MessageResponseDto[];

  @ApiProperty({ type: MessagingPageDto })
  page!: MessagingPageDto;
}

export class MessagingUnreadCountDto {
  @ApiProperty({ minimum: 0 })
  count!: number;
}

export class ConversationReadResponseDto {
  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ format: 'uuid' })
  messageId!: string;

  @ApiProperty({ format: 'date-time' })
  readAt!: string;
}
