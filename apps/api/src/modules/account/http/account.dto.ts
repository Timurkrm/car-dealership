import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../users';

export class UpdateProfileInput {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(/^[^\p{Cc}]+$/u)
  displayName!: string;
}
export class AccountProfileResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;
  @ApiProperty({ type: String, format: 'email', nullable: true })
  pendingEmail!: string | null;
}
export class EmailChangeRequestInput {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @Matches(/^[!-~]+$/)
  @MaxLength(254)
  newEmail!: string;
  @ApiProperty({ format: 'password', maxLength: 256, writeOnly: true })
  @IsString()
  @Length(1, 256)
  currentPassword!: string;
}
export class NotificationPreferencesInput {
  @ApiProperty() @IsBoolean() messagesEmail!: boolean;
  @ApiProperty() @IsBoolean() savedSearchesEmail!: boolean;
  @ApiProperty() @IsBoolean() favoritesEmail!: boolean;
  @ApiProperty() @IsBoolean() moderationEmail!: boolean;
}
export class NotificationPreferencesResponse extends NotificationPreferencesInput {
  @ApiProperty({ readOnly: true, enum: [true] }) securityEmail!: true;
}
export class AccountSessionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastActivityAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() current!: boolean;
}
