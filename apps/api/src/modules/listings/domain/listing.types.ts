export const LISTING_STATUSES = [
  'DRAFT',
  'PENDING_MODERATION',
  'PUBLISHED',
  'REJECTED',
  'SOLD',
  'ARCHIVED',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
/** PostgreSQL BIGINT is transported as a decimal string, never a JS number. */
export type MinorUnits = string;

export function validatePrice(priceMinor: MinorUnits, currency: string): void {
  if (
    priceMinor.length > 19 ||
    !/^(0|[1-9][0-9]*)$/.test(priceMinor) ||
    BigInt(priceMinor) > 9223372036854775807n
  ) {
    throw new RangeError('Price must be a nonnegative int64 decimal string');
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError('Currency must be a three-letter uppercase code');
  }
}
