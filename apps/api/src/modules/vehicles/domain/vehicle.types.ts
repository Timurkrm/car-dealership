export const BODY_TYPES = [
  'SEDAN',
  'HATCHBACK',
  'SUV',
  'COUPE',
  'WAGON',
  'CONVERTIBLE',
  'VAN',
  'PICKUP',
  'OTHER',
] as const;
export type BodyType = (typeof BODY_TYPES)[number];
export const FUEL_TYPES = [
  'PETROL',
  'DIESEL',
  'ELECTRIC',
  'HYBRID',
  'PLUG_IN_HYBRID',
  'LPG',
  'HYDROGEN',
  'OTHER',
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
export const TRANSMISSIONS = ['MANUAL', 'AUTOMATIC', 'OTHER'] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];
export const DRIVE_TYPES = ['FWD', 'RWD', 'AWD', 'OTHER'] as const;
export type DriveType = (typeof DRIVE_TYPES)[number];
export const VEHICLE_CONDITIONS = ['NEW', 'USED', 'DAMAGED'] as const;
export type VehicleCondition = (typeof VEHICLE_CONDITIONS)[number];
export const VEHICLE_COLORS = [
  'BLACK',
  'WHITE',
  'GRAY',
  'SILVER',
  'BLUE',
  'RED',
  'GREEN',
  'BROWN',
  'BEIGE',
  'YELLOW',
  'ORANGE',
  'PURPLE',
  'OTHER',
] as const;
export type VehicleColor = (typeof VEHICLE_COLORS)[number];

export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase();
}
