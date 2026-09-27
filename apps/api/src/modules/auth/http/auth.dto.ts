import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, USER_STATUSES, normalizeEmail } from '../../users';
import type { UserRoleName, UserStatus } from '../../users';

export class EmailInput {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @Matches(/^[!-~]+$/)
  @MaxLength(254)
  email!: string;
}
export class LoginInput extends EmailInput {
  @ApiProperty({
    format: 'password',
    minLength: 1,
    maxLength: 256,
    writeOnly: true,
  })
  @IsString()
  @Length(1, 256)
  password!: string;
}
export class RegisterInput extends LoginInput {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  @Matches(/^[^\p{Cc}]+$/u)
  displayName!: string;
}
export class TokenInput {
  @ApiProperty({ minLength: 43, maxLength: 43, writeOnly: true })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}
export class ResetPasswordInput extends TokenInput {
  @ApiProperty({
    format: 'password',
    description: '15–128 Unicode code points; never normalized or truncated',
    maxLength: 256,
    writeOnly: true,
  })
  @IsString()
  @Length(1, 256)
  newPassword!: string;
}
export class ChangePasswordInput {
  @ApiProperty({ format: 'password', maxLength: 256, writeOnly: true })
  @IsString()
  @Length(1, 256)
  currentPassword!: string;
  @ApiProperty({
    format: 'password',
    description: '15–128 Unicode code points',
    maxLength: 256,
    writeOnly: true,
  })
  @IsString()
  @Length(1, 256)
  newPassword!: string;
}
export class MessageResponse {
  @ApiProperty() message!: string;
}
export class AccessResponse {
  @ApiProperty({ description: 'Short-lived JWT. Keep in browser memory only.' })
  accessToken!: string;
  @ApiProperty({ example: 600 }) expiresIn!: number;
}
export class CurrentUserResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ enum: USER_ROLES, isArray: true }) roles!: UserRoleName[];
  @ApiProperty({ enum: USER_STATUSES }) status!: UserStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;
}
