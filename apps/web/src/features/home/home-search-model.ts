import type { SearchListingType } from '../search/search-client';
import {
  serializeSearchParameters,
  validateSearch,
} from '../search/search-parameters';
import { validatePartSearch } from '../parts/part-filter-model';

export function homeSearchTarget(
  type: SearchListingType,
  input: string,
): { href: string; error?: never } | { error: string; href?: never } {
  const value = input.trim();
  const parameters = value
    ? { [type === 'VEHICLE' ? 'yearFrom' : 'partNumber']: value }
    : {};
  const error =
    type === 'VEHICLE'
      ? validateSearch(parameters)
      : validatePartSearch(parameters);
  if (error) return { error };
  const query = serializeSearchParameters(parameters);
  return {
    href: `${type === 'VEHICLE' ? '/cars' : '/parts'}${query ? `?${query}` : ''}`,
  };
}
