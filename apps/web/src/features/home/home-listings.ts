import { parseSearchPage } from '../search/search-client';
import type { SearchItem, SearchListingType } from '../search/search-client';
export type LatestState =
  { status: 'ready'; items: SearchItem[] } | { status: 'error' };

/** Public server transport only: no incoming cookies, credentials or forwarded headers. */
export async function loadLatestListings(
  origin: string,
  type: SearchListingType,
  fetcher: typeof fetch = fetch,
): Promise<LatestState> {
  try {
    const response = await fetcher(
      `${origin}/api/v1/listings?type=${type}&sort=newest&limit=4`,
      {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return { status: 'error' };
    const result = parseSearchPage(await response.json());
    if (
      result.items.length > 4 ||
      result.items.some((item) => item.type !== type)
    )
      return { status: 'error' };
    return { status: 'ready', items: result.items };
  } catch {
    return { status: 'error' };
  }
}
