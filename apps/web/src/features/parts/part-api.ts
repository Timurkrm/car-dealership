import type { AuthClient } from '../auth/auth-client';
import { catalogItem, id, invalid, page } from '../listings/listing-response';
import type {
  CatalogItem,
  OwnerResult,
  PartCategory,
  PublicPartListing,
} from '../listings/listing-types';
import {
  parseCategory,
  parsePartOwner,
  parsePartPublic,
} from './part-response';
export class PartApi {
  constructor(private readonly client: AuthClient) {}
  async categories(signal?: AbortSignal): Promise<PartCategory[]> {
    return this.catalog('part-categories', parseCategory, signal);
  }
  async brands(signal?: AbortSignal): Promise<CatalogItem[]> {
    return this.catalog('part-brands', catalogItem, signal);
  }
  private async catalog<T>(
    path: string,
    parse: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T[]> {
    const items: T[] = [];
    for (let offset = 0; offset <= 10000; offset += 50) {
      const result = page(
        await (
          await this.client.api(
            'catalog/' + path + '?limit=50&offset=' + offset,
            { signal },
          )
        ).json(),
        parse,
      );
      items.push(...result.items);
      if (!result.hasMore) return items;
    }
    return invalid();
  }
  async detail(
    listingId: string,
    signal?: AbortSignal,
  ): Promise<PublicPartListing> {
    return parsePartPublic(
      await (
        await this.client.api('parts/listings/' + id(listingId), { signal })
      ).json(),
    );
  }
  async create(body: object): Promise<OwnerResult> {
    return this.owner(
      await this.client.apiAuthenticated('parts/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }
  async update(
    listingId: string,
    etag: string,
    body: object,
  ): Promise<OwnerResult> {
    return this.owner(
      await this.client.apiAuthenticated('me/part-listings/' + id(listingId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'if-match': etag },
        body: JSON.stringify(body),
      }),
    );
  }
  private async owner(response: Response): Promise<OwnerResult> {
    const listing = parsePartOwner(await response.json());
    const etag = response.headers.get('etag');
    if (etag !== '"' + listing.version + '"') return invalid();
    return { listing, etag };
  }
}
