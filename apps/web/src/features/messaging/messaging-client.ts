import { AuthApiError } from '../auth/auth-client';
import type { AuthClient } from '../auth/auth-client';

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}
export interface ConversationItem {
  id: string;
  listing: Record<string, unknown> & { listingId: string };
  otherParticipant: { id: string; displayName: string };
  lastMessage: {
    id: string;
    senderId: string;
    body: string | null;
    createdAt: string | null;
  } | null;
  unreadCount: number;
  activityAt: string;
  canSend: boolean;
}
export interface ConversationDetail {
  id: string;
  listing: Record<string, unknown> & { listingId: string };
  canSend: boolean;
}
export interface CursorPage<T> {
  items: T[];
  page: { hasNextPage: boolean; nextCursor: string | null };
}

export class MessagingClient {
  constructor(private readonly auth: AuthClient) {}

  async open(listingId: string): Promise<{ id: string }> {
    return parseOpen(
      await (
        await this.auth.apiAuthenticated('conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ listingId: uuid(listingId) }),
        })
      ).json(),
    );
  }
  async conversations(
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CursorPage<ConversationItem>> {
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) query.set('cursor', cursor);
    return parseConversationPage(
      await (
        await this.auth.apiAuthenticated(`me/conversations?${query}`, {
          signal,
        })
      ).json(),
    );
  }
  async detail(id: string, signal?: AbortSignal): Promise<ConversationDetail> {
    return parseConversationDetail(
      await (
        await this.auth.apiAuthenticated(`me/conversations/${uuid(id)}`, {
          signal,
        })
      ).json(),
    );
  }
  async history(
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CursorPage<MessageItem>> {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor) query.set('cursor', cursor);
    return parseMessagePage(
      await (
        await this.auth.apiAuthenticated(
          `me/conversations/${uuid(id)}/messages?${query}`,
          { signal },
        )
      ).json(),
    );
  }
  async send(
    id: string,
    clientMessageId: string,
    body: string,
  ): Promise<MessageItem> {
    return parseMessage(
      await (
        await this.auth.apiAuthenticated(
          `me/conversations/${uuid(id)}/messages`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              clientMessageId: uuid(clientMessageId),
              body,
            }),
          },
        )
      ).json(),
    );
  }
  async markRead(id: string, messageId: string): Promise<void> {
    await this.auth.apiAuthenticated(`me/conversations/${uuid(id)}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId: uuid(messageId) }),
    });
  }
  async unread(signal?: AbortSignal): Promise<number> {
    const row = object(
      await (
        await this.auth.apiAuthenticated('me/conversations/unread-count', {
          signal,
        })
      ).json(),
    );
    if (!Number.isSafeInteger(row.count) || Number(row.count) < 0) invalid();
    return Number(row.count);
  }
  async report(messageId: string): Promise<void> {
    await this.auth.apiAuthenticated('reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetType: 'MESSAGE',
        targetId: uuid(messageId),
        reason: 'HARASSMENT',
      }),
    });
  }
}

function parseOpen(value: unknown) {
  const row = object(value);
  return { id: uuid(row.id) };
}
function parseConversationPage(value: unknown): CursorPage<ConversationItem> {
  const row = object(value);
  if (!Array.isArray(row.items) || row.items.length > 20) invalid();
  return { items: row.items.map(parseConversation), page: parsePage(row.page) };
}
function parseConversation(value: unknown): ConversationItem {
  const row = object(value),
    other = object(row.otherParticipant),
    listing = object(row.listing);
  const last = row.lastMessage === null ? null : object(row.lastMessage);
  return {
    id: uuid(row.id),
    listing: { ...listing, listingId: uuid(listing.listingId) },
    otherParticipant: {
      id: uuid(other.id),
      displayName: text(other.displayName),
    },
    lastMessage: last
      ? {
          id: uuid(last.id),
          senderId: uuid(last.senderId),
          body: last.body === null ? null : text(last.body),
          createdAt: last.createdAt === null ? null : text(last.createdAt),
        }
      : null,
    unreadCount: integer(row.unreadCount),
    activityAt: text(row.activityAt),
    canSend: bool(row.canSend),
  };
}
function parseConversationDetail(value: unknown): ConversationDetail {
  const row = object(value);
  const listing = object(row.listing);
  return {
    id: uuid(row.id),
    listing: { ...listing, listingId: uuid(listing.listingId) },
    canSend: bool(row.canSend),
  };
}
function parseMessagePage(value: unknown): CursorPage<MessageItem> {
  const row = object(value);
  if (!Array.isArray(row.items) || row.items.length > 100) invalid();
  return { items: row.items.map(parseMessage), page: parsePage(row.page) };
}
export function parseMessage(value: unknown): MessageItem {
  const row = object(value);
  return {
    id: uuid(row.id),
    conversationId: uuid(row.conversationId),
    senderId: uuid(row.senderId),
    clientMessageId: uuid(row.clientMessageId),
    body: row.body === null ? null : text(row.body),
    createdAt: text(row.createdAt),
    editedAt: row.editedAt === null ? null : text(row.editedAt),
    deletedAt: row.deletedAt === null ? null : text(row.deletedAt),
  };
}
function parsePage(value: unknown) {
  const row = object(value);
  if (typeof row.hasNextPage !== 'boolean') invalid();
  return {
    hasNextPage: row.hasNextPage,
    nextCursor: row.nextCursor === null ? null : text(row.nextCursor),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') invalid();
  return value;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalid();
  return Number(value);
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid();
  return value;
}
function uuid(value: unknown): string {
  const valueText = text(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      valueText,
    )
  )
    invalid();
  return valueText;
}
function invalid(): never {
  throw new AuthApiError(502, 'INVALID_API_RESPONSE');
}
