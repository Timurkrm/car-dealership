import { ApiException } from '../../../platform/http/api-error';
import type { ListingStatus } from '../../listings';
import type {
  ModerationTargetType,
  ReportReason,
  ReportStatus,
} from './moderation.types';

export type ListingModerationCommand = 'approve' | 'reject' | 'remove';
export function nextModerationListingStatus(
  status: ListingStatus,
  command: ListingModerationCommand,
): ListingStatus {
  if (command === 'approve' && status === 'PENDING_MODERATION')
    return 'PUBLISHED';
  if (command === 'reject' && status === 'PENDING_MODERATION')
    return 'REJECTED';
  if (command === 'remove' && status === 'PUBLISHED') return 'ARCHIVED';
  throw new ApiException(
    409,
    'MODERATION_INVALID_STATE',
    'Moderation command is not allowed in the current state',
  );
}

export function finalReportStatus(
  current: ReportStatus,
  outcome: 'RESOLVED' | 'DISMISSED',
): ReportStatus {
  if (current !== 'OPEN' && current !== 'IN_REVIEW')
    throw new ApiException(
      409,
      'REPORT_ALREADY_RESOLVED',
      'Report is already final',
    );
  return outcome;
}

const TARGET_REASONS: Record<ModerationTargetType, readonly ReportReason[]> = {
  LISTING: [
    'SCAM',
    'SPAM',
    'PROHIBITED_CONTENT',
    'MISLEADING_INFORMATION',
    'DUPLICATE',
    'WRONG_CATEGORY',
    'OTHER',
  ],
  USER: [
    'SCAM',
    'SPAM',
    'PROHIBITED_CONTENT',
    'MISLEADING_INFORMATION',
    'HARASSMENT',
    'OTHER',
  ],
  MESSAGE: [
    'SCAM',
    'SPAM',
    'PROHIBITED_CONTENT',
    'MISLEADING_INFORMATION',
    'HARASSMENT',
    'OTHER',
  ],
};
export function reportReasonApplies(
  target: ModerationTargetType,
  reason: ReportReason,
): boolean {
  return TARGET_REASONS[target].includes(reason);
}
