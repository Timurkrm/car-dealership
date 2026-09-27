export { EmailDeliveryModule } from './email-delivery.module';
export { EmailDeliveryRecords } from './application/email-delivery-records';
export { EmailDeliveryWorker } from './application/email-delivery-worker';
export { NotificationPreferencesService } from './application/notification-preferences.service';
export type { MutableNotificationPreferences } from './application/notification-preferences.service';
export {
  EmailSender,
  PreviewEmailSender,
  EmailProviderError,
} from './infrastructure/email/email-sender';
export type {
  EmailMessage,
  EmailSendResult,
} from './infrastructure/email/email-sender';
export type {
  EmailTemplate,
  NotificationPreferenceView,
} from './domain/email-delivery.types';
export { renderEmail, escapeHtml } from './application/email-templates';
