import { ApiException } from '../../../platform/http/api-error';
import { validatePrice } from './listing.types';

export const SUPPORTED_CURRENCIES = [
  'RUB',
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'AUD',
  'CNY',
  'JPY',
] as const;
export function assertListingPrice(
  amountMinor: string,
  currency: string,
): void {
  try {
    validatePrice(amountMinor, currency);
    if (
      amountMinor === '0' ||
      !SUPPORTED_CURRENCIES.some((code) => code === currency)
    )
      throw new RangeError('Invalid price');
  } catch {
    throw new ApiException(400, 'INVALID_PRICE', 'Invalid listing price');
  }
}
