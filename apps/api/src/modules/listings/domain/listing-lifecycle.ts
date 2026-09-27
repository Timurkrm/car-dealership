import { ApiException } from '../../../platform/http/api-error';
import type { ListingStatus } from './listing.types';

export type SellerAction = 'submit' | 'archive' | 'mark-sold';
export const EDITABLE_STATUSES: readonly ListingStatus[] = [
  'DRAFT',
  'REJECTED',
];
const TRANSITIONS: Record<
  SellerAction,
  Partial<Record<ListingStatus, ListingStatus>>
> = {
  submit: { DRAFT: 'PENDING_MODERATION', REJECTED: 'PENDING_MODERATION' },
  archive: {
    DRAFT: 'ARCHIVED',
    REJECTED: 'ARCHIVED',
    PENDING_MODERATION: 'ARCHIVED',
    PUBLISHED: 'ARCHIVED',
    SOLD: 'ARCHIVED',
    ARCHIVED: 'ARCHIVED',
  },
  'mark-sold': { PUBLISHED: 'SOLD' },
};
export function assertEditable(status: ListingStatus): void {
  if (!EDITABLE_STATUSES.includes(status))
    throw new ApiException(
      409,
      'LISTING_INVALID_STATE',
      'Listing cannot be edited in its current state',
    );
}
export function nextSellerStatus(
  status: ListingStatus,
  action: SellerAction,
): ListingStatus {
  const next = TRANSITIONS[action][status];
  if (!next)
    throw new ApiException(
      409,
      'LISTING_INVALID_STATE_TRANSITION',
      'Listing action is not allowed in its current state',
    );
  return next;
}
