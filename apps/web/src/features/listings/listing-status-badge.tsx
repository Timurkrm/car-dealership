import { StatusBadge, type Tone } from '../../components/ui/badge';
import { STATUS_LABELS, type ListingStatus } from './listing-types';

// Domain presentation stays with Listings; the shared primitive knows no statuses.
const tones: Record<ListingStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_MODERATION: 'warning',
  REJECTED: 'danger',
  PUBLISHED: 'success',
  SOLD: 'info',
  ARCHIVED: 'neutral',
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <StatusBadge tone={tones[status]}>{STATUS_LABELS[status]}</StatusBadge>
  );
}
