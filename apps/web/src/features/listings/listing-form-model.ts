import { AuthApiError } from '../auth/auth-client';
import type { OwnerListing } from './listing-types';
import { CURRENCIES, SPEC_OPTIONS } from './listing-types';

export interface CatalogSelection {
  makeId: string;
  modelId: string;
  generationId: string;
}
export function selectMake(
  current: CatalogSelection,
  makeId: string,
): CatalogSelection {
  return makeId === current.makeId
    ? current
    : { makeId, modelId: '', generationId: '' };
}
export function selectModel(
  current: CatalogSelection,
  modelId: string,
): CatalogSelection {
  return modelId === current.modelId
    ? current
    : { ...current, modelId, generationId: '' };
}
function invalid(): never {
  throw new AuthApiError(400, 'VALIDATION_ERROR');
}
function exponent(currency: string): number {
  if (!CURRENCIES.some((code) => code === currency)) return invalid();
  return currency === 'JPY' ? 0 : 2;
}
export function minorFromDecimal(value: string, currency: string): string {
  const digits = exponent(currency);
  const normalized = value.trim().replace(',', '.');
  if (!/^[0-9]{1,19}(\.[0-9]{1,2})?$/.test(normalized)) return invalid();
  const [whole = '', fraction = ''] = normalized.split('.');
  if (fraction.length > digits) return invalid();
  const result =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, '0') || '0');
  if (result <= 0n || result > 9223372036854775807n) return invalid();
  return result.toString();
}
export function decimalFromMinor(value: string, currency: string): string {
  const digits = exponent(currency);
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) return invalid();
  if (!digits) return value;
  return `${value.padStart(digits + 1, '0').slice(0, -digits)}.${value.padStart(digits + 1, '0').slice(-digits)}`;
}
export function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}
export function integer(
  data: FormData,
  key: string,
  min: number,
  max = 2147483647,
): number {
  const value = field(data, key);
  if (!/^[0-9]{1,10}$/.test(value)) return invalid();
  const result = Number(value);
  return result >= min && result <= max ? result : invalid();
}
function coordinate(data: FormData, key: string, limit: number): number {
  const value = field(data, key).trim();
  if (!/^-?[0-9]{1,3}(\.[0-9]{1,15})?$/.test(value)) return invalid();
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= limit
    ? result
    : invalid();
}
export function formPayload(data: FormData, selection: CatalogSelection) {
  if (!selection.modelId) return invalid();
  const specs = Object.fromEntries(
    Object.entries(SPEC_OPTIONS)
      .filter(([key]) => key !== 'color')
      .map(([key, options]) => {
        const value = field(data, key);
        if (!options.some((option) => option === value)) return invalid();
        return [key, value];
      }),
  );
  const color = field(data, 'color');
  if (color && !SPEC_OPTIONS.color.some((option) => option === color))
    return invalid();
  const vin = field(data, 'vin').trim().toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return invalid();
  return {
    vehicle: {
      modelId: selection.modelId,
      generationId: selection.generationId || null,
      year: integer(data, 'year', 1886, 2100),
      mileageKm: integer(data, 'mileageKm', 0),
      ...specs,
      color: color || null,
      vin: vin || null,
      enginePowerHp: field(data, 'enginePowerHp')
        ? integer(data, 'enginePowerHp', 1)
        : null,
      engineDisplacementCc: field(data, 'engineDisplacementCc')
        ? integer(data, 'engineDisplacementCc', 1)
        : null,
    },
    ...commonPayload(data),
  };
}
/** A conflict keeps unsaved form values and disables further writes until explicit reload. */
export function isVersionConflict(error: unknown): boolean {
  return (
    error instanceof AuthApiError && error.code === 'LISTING_VERSION_CONFLICT'
  );
}
export function initialSelection(listing?: OwnerListing): CatalogSelection {
  return {
    makeId: listing?.vehicle.make.id ?? '',
    modelId: listing?.vehicle.model.id ?? '',
    generationId: listing?.vehicle.generation?.id ?? '',
  };
}

export function commonPayload(data: FormData) {
  const currency = field(data, 'currency');
  return {
    listing: {
      title: field(data, 'title').trim(),
      description: field(data, 'description') || null,
      price: {
        amountMinor: minorFromDecimal(field(data, 'price'), currency),
        currency,
      },
    },
    location: data.get('hasLocation')
      ? {
          latitude: coordinate(data, 'latitude', 90),
          longitude: coordinate(data, 'longitude', 180),
          city: field(data, 'city').trim(),
          region: field(data, 'region').trim() || null,
          countryCode: field(data, 'countryCode').trim().toUpperCase(),
          publicPoint: data.get('hasPublicPoint')
            ? {
                latitude: coordinate(data, 'publicLatitude', 90),
                longitude: coordinate(data, 'publicLongitude', 180),
              }
            : null,
        }
      : null,
  };
}
