import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACCOUNT_ACTION_REASONS } from '../../moderation';
import type { AccountActionReason } from '../../moderation';
import { USER_ROLES, USER_STATUSES } from '../../users';
import type { UserRoleName, UserStatus } from '../../users';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const int = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const plain = /^(?:[^\p{Cc}\p{Cs}]|[\n\t])*$/u;

export class AdminUsersQuery {
  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRoleName;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    format: 'email',
    description: 'Exact normalized email match.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(254)
  @Matches(/^[^\s@]+@[^\s@]+$/)
  email?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(iso)
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(iso)
  createdTo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Transform(int)
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

export class UserStatusActionInput {
  @ApiProperty({ enum: USER_STATUSES })
  @IsIn(USER_STATUSES)
  expectedStatus!: UserStatus;

  @ApiProperty({ enum: ACCOUNT_ACTION_REASONS })
  @IsIn(ACCOUNT_ACTION_REASONS)
  reasonCode!: AccountActionReason;

  @ApiProperty({
    minLength: 1,
    maxLength: 2000,
    description: 'Internal plain-text audit context.',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  @Matches(plain)
  note!: string;
}

export class ReplaceRolesInput {
  @ApiProperty({ enum: USER_ROLES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(USER_ROLES, { each: true })
  roles!: UserRoleName[];

  @ApiProperty({ enum: USER_ROLES, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(USER_ROLES, { each: true })
  expectedRoles!: UserRoleName[];
}

export class AdminAuditQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  actorUserId?: string;
  @ApiPropertyOptional({ pattern: '^[A-Z][A-Z0-9_]{0,31}$' })
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{0,31}$/)
  targetType?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  targetId?: string;
  @ApiPropertyOptional({ pattern: '^[A-Z][A-Z0-9_]{0,63}$' })
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{0,63}$/)
  action?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(iso)
  from?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @Matches(iso)
  to?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @Transform(int)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}
