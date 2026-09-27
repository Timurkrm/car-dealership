import { ApiException } from '../../../platform/http/api-error';

export function expectedListingVersion(value: unknown): number {
  if (value === undefined)
    throw new ApiException(
      428,
      'LISTING_VERSION_REQUIRED',
      'If-Match listing ETag is required',
    );
  if (typeof value !== 'string' || !/^"[1-9][0-9]{0,9}"$/.test(value))
    throw new ApiException(
      400,
      'VALIDATION_ERROR',
      'If-Match must contain one quoted positive integer',
    );
  const version = Number(value.slice(1, -1));
  if (version > 2147483646)
    throw new ApiException(
      400,
      'VALIDATION_ERROR',
      'If-Match version is out of range',
    );
  return version;
}
