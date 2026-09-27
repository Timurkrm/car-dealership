export const MODERATION_TARGET_TYPES = ['LISTING', 'USER', 'MESSAGE'] as const;
export type ModerationTargetType = (typeof MODERATION_TARGET_TYPES)[number];
export const REPORT_STATUSES = [
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'DISMISSED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_REASONS = [
  'SCAM',
  'SPAM',
  'PROHIBITED_CONTENT',
  'MISLEADING_INFORMATION',
  'HARASSMENT',
  'DUPLICATE',
  'WRONG_CATEGORY',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_RESOLUTIONS = [
  'NO_ACTION',
  'CONTENT_REMOVED',
  'WARNING',
  'OTHER',
] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];
export const LISTING_REJECTION_REASONS = [
  'INCORRECT_INFORMATION',
  'PROHIBITED_CONTENT',
  'INVALID_PRICE',
  'INVALID_LOCATION',
  'INVALID_PHOTOS',
  'DUPLICATE_LISTING',
  'WRONG_CATEGORY',
  'INSUFFICIENT_INFORMATION',
  'OTHER',
] as const;
export type ListingRejectionReason = (typeof LISTING_REJECTION_REASONS)[number];
export const ACCOUNT_ACTION_REASONS = [
  'TERMS_VIOLATION',
  'FRAUD_RISK',
  'HARASSMENT',
  'SECURITY_INCIDENT',
  'ADMINISTRATIVE_REVIEW',
  'OTHER',
] as const;
export type AccountActionReason = (typeof ACCOUNT_ACTION_REASONS)[number];
export const MODERATION_ACTIONS = [
  'APPROVE_LISTING',
  'REJECT_LISTING',
  'ARCHIVE_LISTING',
  'REMOVE_LISTING',
  'SUSPEND_USER',
  'BLOCK_USER',
  'RESTORE_USER',
  'REDACT_MESSAGE',
] as const;
export type ModerationActionName = (typeof MODERATION_ACTIONS)[number];
