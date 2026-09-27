export type Role = 'USER' | 'MODERATOR' | 'ADMIN';
export type ListingType = 'VEHICLE' | 'PART';

export interface CursorPage {
  hasNextPage: boolean;
  nextCursor: string | null;
}
export interface QueueListing {
  id: string;
  type: ListingType;
  title: string;
  submittedAt: string;
  version: number;
  seller: { id: string; displayName: string };
  cover: { url: string; width: number; height: number } | null;
  subtype: Record<string, string | number> | null;
}
export interface QueueListingPage {
  items: QueueListing[];
  page: CursorPage;
}
export interface ModerationHistoryItem {
  id: string;
  action: string;
  reasonCode: string;
  sellerMessage?: string | null;
  internalNote: string | null;
  createdAt: string;
}
export interface ModerationListingDetail {
  id: string;
  type: ListingType;
  title: string;
  description: string | null;
  status: string;
  version: number;
  price: { amountMinor: string; currency: string };
  seller: {
    id: string;
    displayName: string;
    email: string;
    status: string;
  } | null;
  vehicle?: Record<string, unknown>;
  part?: Record<string, unknown>;
  location: Record<string, unknown> | null;
  media: Array<{
    id: string;
    status: string;
    isPrimary: boolean;
    variants: { medium: { url: string } } | null;
  }>;
  moderationHistory: ModerationHistoryItem[];
}
export interface ReportSummary {
  id: string;
  targetType: 'LISTING' | 'USER' | 'MESSAGE';
  targetId: string;
  reason: string;
  status: string;
  reporter: { id: string; displayName: string };
  createdAt: string;
}
export interface ReportPage {
  items: ReportSummary[];
  page: CursorPage;
}
export interface ReportDetail extends ReportSummary {
  details: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  target: Record<string, unknown> | null;
  relatedReports: number;
  moderationHistory: ModerationHistoryItem[];
}
export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string;
  status: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'BLOCKED';
  roles: Role[];
  createdAt: string;
}
export interface AdminUserPage {
  items: AdminUserSummary[];
  page: CursorPage;
}
export interface AdminUserDetail extends AdminUserSummary {
  emailVerifiedAt: string | null;
  updatedAt: string;
  activeSessionCount: number;
  listingCounts: Array<{ type: ListingType; status: string; count: number }>;
  recentAudit: AuditItem[];
}
export interface AuditItem {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string | null;
  metadata: {
    changedFields?: string[];
    reasonCode?: string;
    previousStatus?: string;
    nextStatus?: string;
    listingType?: ListingType;
  };
}
export interface AuditPage {
  items: AuditItem[];
  page: CursorPage;
}

export function canModerate(roles: readonly Role[]): boolean {
  return roles.includes('MODERATOR') || roles.includes('ADMIN');
}
export function canAdminister(roles: readonly Role[]): boolean {
  return roles.includes('ADMIN');
}
export function formatAge(value: string, now = Date.now()): string {
  const hours = Math.max(0, Math.floor((now - Date.parse(value)) / 3_600_000));
  if (hours < 24) return `${hours} ч`;
  return `${Math.floor(hours / 24)} д`;
}
export function safeAuditMetadata(item: AuditItem): string {
  const values = [
    item.metadata.reasonCode,
    item.metadata.previousStatus && item.metadata.nextStatus
      ? `${item.metadata.previousStatus} → ${item.metadata.nextStatus}`
      : null,
    item.metadata.listingType,
    item.metadata.changedFields?.join(', '),
  ].filter((value): value is string => Boolean(value));
  return values.join(' · ') || '—';
}
