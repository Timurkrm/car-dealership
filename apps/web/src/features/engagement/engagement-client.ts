import { AuthApiError } from '../auth/auth-client';
import type { AuthClient } from '../auth/auth-client';
import type { SearchParameters } from '../search/search-parameters';

export type ListingType = 'VEHICLE' | 'PART';
export type FavoriteItem =
  | {
      kind: ListingType;
      listingId: string;
      title: string;
      availability: 'AVAILABLE' | 'SOLD';
      price: { amountMinor: string; currency: string };
      cover: { url: string; width: number; height: number };
      addedAt: string;
      vehicle?: {
        make: { name: string };
        model: { name: string };
        year: number;
        mileageKm: number;
      };
      part?: { name: string; category: { name: string }; condition: string };
    }
  | {
      kind: 'UNAVAILABLE';
      listingId: string;
      availability: 'UNAVAILABLE';
      addedAt: string;
    };

export interface SavedSearchItem {
  id: string;
  name: string;
  type: ListingType;
  schemaVersion: number;
  supported: boolean;
  filters: SearchParameters;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  content: Record<string, string | number | boolean>;
  target: { kind: 'LISTING' | 'CONVERSATION'; id: string } | null;
}

function invalid(): never {
  throw new AuthApiError(502, 'INVALID_API_RESPONSE');
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}
function uuid(value: unknown): string {
  const id = text(value);
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id : invalid();
}
function page(value: unknown): {
  hasNextPage: boolean;
  nextCursor: string | null;
} {
  const row = object(value);
  if (typeof row.hasNextPage !== 'boolean') return invalid();
  return {
    hasNextPage: row.hasNextPage,
    nextCursor: row.nextCursor === null ? null : text(row.nextCursor),
  };
}

export class EngagementClient {
  constructor(private readonly auth: AuthClient) {}

  async favorite(listingId: string): Promise<void> {
    await this.auth.apiAuthenticated(`me/favorites/${uuid(listingId)}`, {
      method: 'PUT',
    });
  }
  async unfavorite(listingId: string): Promise<void> {
    await this.auth.apiAuthenticated(`me/favorites/${uuid(listingId)}`, {
      method: 'DELETE',
    });
  }
  async favorites(
    type?: ListingType,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<{
    items: FavoriteItem[];
    page: { hasNextPage: boolean; nextCursor: string | null };
  }> {
    const query = new URLSearchParams({ limit: '20' });
    if (type) query.set('type', type);
    if (cursor) query.set('cursor', cursor);
    const value: unknown = await (
      await this.auth.apiAuthenticated(`me/favorites?${query}`, { signal })
    ).json();
    const row = object(value);
    if (!Array.isArray(row.items) || row.items.length > 20) return invalid();
    return { items: row.items.map(parseFavorite), page: page(row.page) };
  }

  async createSavedSearch(input: {
    name: string;
    type: ListingType;
    filters: SearchParameters;
    notificationsEnabled: boolean;
  }): Promise<SavedSearchItem> {
    return parseSavedSearch(
      await (
        await this.auth.apiAuthenticated('me/saved-searches', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).json(),
    );
  }
  async savedSearches(signal?: AbortSignal): Promise<SavedSearchItem[]> {
    const value: unknown = await (
      await this.auth.apiAuthenticated('me/saved-searches', { signal })
    ).json();
    const row = object(value);
    if (!Array.isArray(row.items) || row.items.length > 200) return invalid();
    return row.items.map(parseSavedSearch);
  }
  async updateSavedSearch(
    id: string,
    patch: { name?: string; notificationsEnabled?: boolean },
  ): Promise<SavedSearchItem> {
    return parseSavedSearch(
      await (
        await this.auth.apiAuthenticated(`me/saved-searches/${uuid(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        })
      ).json(),
    );
  }
  async removeSavedSearch(id: string): Promise<void> {
    await this.auth.apiAuthenticated(`me/saved-searches/${uuid(id)}`, {
      method: 'DELETE',
    });
  }

  async notifications(
    cursor?: string,
    unreadOnly = false,
    signal?: AbortSignal,
  ): Promise<{
    items: NotificationItem[];
    page: { hasNextPage: boolean; nextCursor: string | null };
  }> {
    const query = new URLSearchParams({
      limit: '20',
      unreadOnly: String(unreadOnly),
    });
    if (cursor) query.set('cursor', cursor);
    const value: unknown = await (
      await this.auth.apiAuthenticated(`me/notifications?${query}`, { signal })
    ).json();
    const row = object(value);
    if (!Array.isArray(row.items) || row.items.length > 20) return invalid();
    return { items: row.items.map(parseNotification), page: page(row.page) };
  }
  async unreadCount(signal?: AbortSignal): Promise<number> {
    const row = object(
      await (
        await this.auth.apiAuthenticated('me/notifications/unread-count', {
          signal,
        })
      ).json(),
    );
    return typeof row.count === 'number' &&
      Number.isSafeInteger(row.count) &&
      row.count >= 0
      ? row.count
      : invalid();
  }
  async markRead(id: string): Promise<void> {
    await this.auth.apiAuthenticated(`me/notifications/${uuid(id)}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  }
  async markAllRead(): Promise<void> {
    await this.auth.apiAuthenticated('me/notifications/read-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
  }
}

function parseFavorite(value: unknown): FavoriteItem {
  const row = object(value),
    kind = text(row.kind),
    listingId = uuid(row.listingId);
  if (kind === 'UNAVAILABLE')
    return {
      kind,
      listingId,
      availability: 'UNAVAILABLE',
      addedAt: text(row.addedAt),
    };
  if (kind !== 'VEHICLE' && kind !== 'PART') return invalid();
  const price = object(row.price),
    cover = object(row.cover);
  const base = {
    kind,
    listingId,
    title: text(row.title),
    availability:
      row.availability === 'SOLD' ? ('SOLD' as const) : ('AVAILABLE' as const),
    price: {
      amountMinor: text(price.amountMinor),
      currency: text(price.currency),
    },
    cover: {
      url: text(cover.url),
      width: Number(cover.width),
      height: Number(cover.height),
    },
    addedAt: text(row.addedAt),
  };
  if (kind === 'VEHICLE') {
    const vehicle = object(row.vehicle),
      make = object(vehicle.make),
      model = object(vehicle.model);
    return {
      ...base,
      kind,
      vehicle: {
        make: { name: text(make.name) },
        model: { name: text(model.name) },
        year: Number(vehicle.year),
        mileageKm: Number(vehicle.mileageKm),
      },
    };
  }
  const part = object(row.part),
    category = object(part.category);
  return {
    ...base,
    kind,
    part: {
      name: text(part.name),
      category: { name: text(category.name) },
      condition: text(part.condition),
    },
  };
}

function parseSavedSearch(value: unknown): SavedSearchItem {
  const row = object(value),
    type = row.type;
  if (
    (type !== 'VEHICLE' && type !== 'PART') ||
    typeof row.supported !== 'boolean' ||
    typeof row.notificationsEnabled !== 'boolean'
  )
    return invalid();
  const filters = object(row.filters);
  if (!Object.values(filters).every((item) => typeof item === 'string'))
    return invalid();
  return {
    id: uuid(row.id),
    name: text(row.name),
    type,
    schemaVersion: Number(row.schemaVersion),
    supported: row.supported,
    filters: filters as SearchParameters,
    notificationsEnabled: row.notificationsEnabled,
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

function parseNotification(value: unknown): NotificationItem {
  const row = object(value),
    content = object(row.content);
  if (
    !Object.values(content).every((item) =>
      ['string', 'number', 'boolean'].includes(typeof item),
    )
  )
    return invalid();
  const target = row.target === null ? null : object(row.target);
  return {
    id: uuid(row.id),
    type: text(row.type),
    createdAt: text(row.createdAt),
    readAt: row.readAt === null ? null : text(row.readAt),
    content: content as Record<string, string | number | boolean>,
    target:
      target === null
        ? null
        : {
            kind:
              target.kind === 'CONVERSATION'
                ? ('CONVERSATION' as const)
                : ('LISTING' as const),
            id: uuid(target.id),
          },
  };
}
