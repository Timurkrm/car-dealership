export const NOTIFICATION_TYPES = [
  'NEW_MESSAGE',
  'LISTING_STATUS_CHANGED',
  'MODERATION_RESULT',
  'ACCOUNT_STATUS_CHANGED',
  'PRICE_CHANGED',
  'SAVED_SEARCH_MATCH',
  'FAVORITE_LISTING_STATUS_CHANGED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationPayload =
  | {
      schemaVersion: 1;
      type: 'NEW_MESSAGE';
      conversationId: string;
      messageId: string;
      listingId: string;
      senderPublicName: string;
    }
  | {
      schemaVersion: 1;
      type: 'MODERATION_RESULT';
      listingId: string;
      status: 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
      reasonCode: string;
      message?: string;
    }
  | {
      schemaVersion: 1;
      type: 'ACCOUNT_STATUS_CHANGED';
      accountStatus: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
      reasonCode: string;
    }
  | {
      schemaVersion: 1;
      type: 'SAVED_SEARCH_MATCH';
      listingId: string;
      listingType: 'VEHICLE' | 'PART';
    }
  | {
      schemaVersion: 1;
      type: 'FAVORITE_LISTING_STATUS_CHANGED';
      listingId: string;
      listingType: 'VEHICLE' | 'PART';
      status: 'SOLD' | 'UNAVAILABLE';
    };

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const code = /^[A-Z][A-Z0-9_]{0,63}$/;

export function notificationPayload(
  type: NotificationType,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const value: Record<string, unknown> = { schemaVersion: 1, ...input };
  if (value.schemaVersion !== 1)
    throw new Error('NOTIFICATION_INVALID_PAYLOAD');
  if (type === 'NEW_MESSAGE') {
    if (
      !hasOnlyKeys(value, [
        'schemaVersion',
        'conversationId',
        'messageId',
        'listingId',
        'senderPublicName',
      ]) ||
      ![value.conversationId, value.messageId, value.listingId].every(
        (entry) => typeof entry === 'string' && uuid.test(entry),
      ) ||
      typeof value.senderPublicName !== 'string' ||
      value.senderPublicName.length < 1 ||
      value.senderPublicName.length > 100
    )
      throw new Error('NOTIFICATION_INVALID_PAYLOAD');
  } else if (type === 'MODERATION_RESULT') {
    if (
      !hasOnlyKeys(value, [
        'schemaVersion',
        'listingId',
        'status',
        'reasonCode',
        'message',
      ]) ||
      typeof value.listingId !== 'string' ||
      !uuid.test(value.listingId) ||
      !['PUBLISHED', 'REJECTED', 'ARCHIVED'].includes(String(value.status)) ||
      typeof value.reasonCode !== 'string' ||
      !code.test(value.reasonCode) ||
      (value.message !== undefined &&
        (typeof value.message !== 'string' || value.message.length > 2000))
    )
      throw new Error('NOTIFICATION_INVALID_PAYLOAD');
  } else if (type === 'ACCOUNT_STATUS_CHANGED') {
    if (
      !hasOnlyKeys(value, ['schemaVersion', 'accountStatus', 'reasonCode']) ||
      !['ACTIVE', 'SUSPENDED', 'BLOCKED'].includes(
        String(value.accountStatus),
      ) ||
      typeof value.reasonCode !== 'string' ||
      !code.test(value.reasonCode)
    )
      throw new Error('NOTIFICATION_INVALID_PAYLOAD');
  } else if (type === 'SAVED_SEARCH_MATCH') {
    if (
      !hasOnlyKeys(value, ['schemaVersion', 'listingId', 'listingType']) ||
      typeof value.listingId !== 'string' ||
      !uuid.test(value.listingId) ||
      !['VEHICLE', 'PART'].includes(String(value.listingType))
    )
      throw new Error('NOTIFICATION_INVALID_PAYLOAD');
  } else if (type === 'FAVORITE_LISTING_STATUS_CHANGED') {
    if (
      !hasOnlyKeys(value, [
        'schemaVersion',
        'listingId',
        'listingType',
        'status',
      ]) ||
      typeof value.listingId !== 'string' ||
      !uuid.test(value.listingId) ||
      !['VEHICLE', 'PART'].includes(String(value.listingType)) ||
      !['SOLD', 'UNAVAILABLE'].includes(String(value.status))
    )
      throw new Error('NOTIFICATION_INVALID_PAYLOAD');
  } else {
    throw new Error('NOTIFICATION_UNSUPPORTED_TYPE');
  }
  return value;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
