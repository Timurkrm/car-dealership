export const OUTBOX_EVENT_TYPES = [
  'LISTING_PUBLISHED',
  'LISTING_MARKED_SOLD',
  'LISTING_ARCHIVED',
  'LISTING_REMOVED_BY_MODERATOR',
  'MESSAGE_CREATED',
] as const;
export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];
export const OUTBOX_STATUSES = [
  'PENDING',
  'PROCESSING',
  'RETRY',
  'PROCESSED',
  'FAILED',
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export interface ListingLifecycleEventPayload {
  schemaVersion: 1;
  listingId: string;
  listingType: 'VEHICLE' | 'PART';
  sellerId: string;
  previousStatus: string;
  nextStatus: 'PUBLISHED' | 'SOLD' | 'ARCHIVED';
}

export interface ListingLifecycleEvent {
  id: string;
  type: Exclude<OutboxEventType, 'MESSAGE_CREATED'>;
  aggregateType: 'LISTING';
  aggregateId: string;
  payload: ListingLifecycleEventPayload;
  occurredAt: Date;
  attempts: number;
  checkpoint: string | null;
}

export interface MessageCreatedEventPayload {
  schemaVersion: 1;
  messageId: string;
  conversationId: string;
  listingId: string;
  senderId: string;
}

export interface MessageCreatedEvent {
  id: string;
  type: 'MESSAGE_CREATED';
  aggregateType: 'MESSAGE';
  aggregateId: string;
  payload: MessageCreatedEventPayload;
  occurredAt: Date;
  attempts: number;
  checkpoint: string | null;
}

export type OutboxDomainEvent = ListingLifecycleEvent | MessageCreatedEvent;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseListingLifecyclePayload(
  value: unknown,
): ListingLifecycleEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('OUTBOX_INVALID_PAYLOAD');
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  if (
    keys.join(',') !==
      'listingId,listingType,nextStatus,previousStatus,schemaVersion,sellerId' ||
    payload.schemaVersion !== 1 ||
    typeof payload.listingId !== 'string' ||
    !uuid.test(payload.listingId) ||
    typeof payload.sellerId !== 'string' ||
    !uuid.test(payload.sellerId) ||
    (payload.listingType !== 'VEHICLE' && payload.listingType !== 'PART') ||
    typeof payload.previousStatus !== 'string' ||
    !['PUBLISHED', 'SOLD', 'ARCHIVED'].includes(String(payload.nextStatus))
  )
    throw new Error('OUTBOX_INVALID_PAYLOAD');
  return payload as unknown as ListingLifecycleEventPayload;
}

export function parseMessageCreatedPayload(
  value: unknown,
): MessageCreatedEventPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('OUTBOX_INVALID_PAYLOAD');
  const payload = value as Record<string, unknown>;
  if (
    Object.keys(payload).sort().join(',') !==
      'conversationId,listingId,messageId,schemaVersion,senderId' ||
    payload.schemaVersion !== 1 ||
    ![
      payload.messageId,
      payload.conversationId,
      payload.listingId,
      payload.senderId,
    ].every((entry) => typeof entry === 'string' && uuid.test(entry))
  )
    throw new Error('OUTBOX_INVALID_PAYLOAD');
  return payload as unknown as MessageCreatedEventPayload;
}
