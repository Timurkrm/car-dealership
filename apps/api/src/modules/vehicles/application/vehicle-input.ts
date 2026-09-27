import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  BODY_TYPES,
  DRIVE_TYPES,
  FUEL_TYPES,
  TRANSMISSIONS,
  VEHICLE_COLORS,
  VEHICLE_CONDITIONS,
  normalizeVin,
} from '../domain/vehicle.types';
import type {
  BodyType,
  DriveType,
  FuelType,
  Transmission,
  VehicleColor,
  VehicleCondition,
} from '../domain/vehicle.types';

export class VehicleInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() modelId!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsUUID()
  generationId?: string | null;
  @ApiProperty({ minimum: 1886, maximum: 2100 })
  @IsInt()
  @Min(1886)
  @Max(2100)
  year!: number;
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  mileageKm!: number;
  @ApiProperty({ enum: BODY_TYPES }) @IsIn(BODY_TYPES) bodyType!: BodyType;
  @ApiProperty({ enum: FUEL_TYPES }) @IsIn(FUEL_TYPES) fuelType!: FuelType;
  @ApiProperty({ enum: TRANSMISSIONS })
  @IsIn(TRANSMISSIONS)
  transmission!: Transmission;
  @ApiProperty({ enum: DRIVE_TYPES }) @IsIn(DRIVE_TYPES) driveType!: DriveType;
  @ApiProperty({ enum: VEHICLE_CONDITIONS })
  @IsIn(VEHICLE_CONDITIONS)
  condition!: VehicleCondition;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  enginePowerHp?: number | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  engineDisplacementCc?: number | null;
  @ApiPropertyOptional({ enum: VEHICLE_COLORS, nullable: true })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsIn(VEHICLE_COLORS)
  color?: VehicleColor | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    pattern: '^[A-HJ-NPR-Z0-9]{17}$',
    writeOnly: true,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeVin(value) : value,
  )
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/)
  vin?: string | null;
}
export class VehiclePatch extends PartialType(VehicleInput, {
  skipNullProperties: false,
}) {}
