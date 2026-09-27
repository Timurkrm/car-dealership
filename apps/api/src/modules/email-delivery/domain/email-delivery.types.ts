export const EMAIL_TEMPLATES = [
  'VERIFY_EMAIL',
  'PASSWORD_RESET',
  'EMAIL_CHANGE_CONFIRMATION',
  'EMAIL_CHANGED',
  'NEW_MESSAGE',
  'SAVED_SEARCH_MATCH',
  'FAVORITE_STATUS_CHANGED',
  'MODERATION_RESULT',
  'ACCOUNT_STATUS_CHANGED',
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export const DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'RETRY',
  'SENT',
  'FAILED',
  'SUPPRESSED',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type NotificationPreferenceCategory =
  'MESSAGES' | 'SAVED_SEARCHES' | 'FAVORITES' | 'MODERATION';

export interface NotificationPreferenceView {
  messagesEmail: boolean;
  savedSearchesEmail: boolean;
  favoritesEmail: boolean;
  moderationEmail: boolean;
  securityEmail: true;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceView = {
  messagesEmail: true,
  savedSearchesEmail: false,
  favoritesEmail: true,
  moderationEmail: true,
  securityEmail: true,
};

export function preferenceCategory(
  template: EmailTemplate,
): NotificationPreferenceCategory | null {
  if (template === 'NEW_MESSAGE') return 'MESSAGES';
  if (template === 'SAVED_SEARCH_MATCH') return 'SAVED_SEARCHES';
  if (template === 'FAVORITE_STATUS_CHANGED') return 'FAVORITES';
  if (template === 'MODERATION_RESULT') return 'MODERATION';
  return null;
}
