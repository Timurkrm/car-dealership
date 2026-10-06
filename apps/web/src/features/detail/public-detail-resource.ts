import { parsePublicListing } from '../listings/listing-api';
import { parsePartPublic } from '../parts/part-response';
import type { PublicDetail } from './detail-model';

export type DetailResult = { status: 'ready'; listing: PublicDetail } | { status: 'not-found' | 'error' };
export async function fetchPublicDetail(
  apiUrl: string, type: 'VEHICLE' | 'PART', id: string, fetcher: typeof fetch = fetch,
): Promise<DetailResult> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return { status: 'not-found' };
  try {
    const response = await fetcher(`${apiUrl}/api/v1/${type === 'PART' ? 'parts/listings' : 'listings'}/${id}`, {
      cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' },
    });
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'error' };
    const body: unknown = await response.json();
    return { status: 'ready', listing: type === 'PART' ? parsePartPublic(body) : parsePublicListing(body) };
  } catch { return { status: 'error' }; }
}
