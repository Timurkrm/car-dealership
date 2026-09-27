import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { StructuredLogger } from '../../../platform/logging/structured-logger';
import { UserIdentity } from '../../users';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  preferenceCategory,
  type NotificationPreferenceView,
} from '../domain/email-delivery.types';
import {
  EmailProviderError,
  EmailSender,
} from '../infrastructure/email/email-sender';
import { renderEmail } from './email-templates';
import {
  EmailDeliveryRecords,
  type ClaimedDelivery,
} from './email-delivery-records';
import { NotificationPreferencesService } from './notification-preferences.service';

@Injectable()
export class EmailDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EmailDeliveryRecords)
    private readonly records: EmailDeliveryRecords,
    @Inject(NotificationPreferencesService)
    private readonly preferences: NotificationPreferencesService,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(EmailSender) private readonly sender: EmailSender,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.dispatch(), 2000);
    this.dispatch();
  }
  private dispatch(): void {
    if (this.stopping || this.running) return;
    this.running = this.runOnce()
      .then(() => undefined)
      .catch(() =>
        this.logger.event('warn', 'Email delivery polling failed', {
          operation: 'email_delivery_poll',
        }),
      )
      .finally(() => {
        this.running = undefined;
      });
  }
  async runOnce(): Promise<number> {
    const deliveries = await this.records.claim();
    if (!deliveries.length) return 0;
    const ids = [...new Set(deliveries.map((delivery) => delivery.userId))];
    const [recipients, preferences] = await Promise.all([
      this.users.emailDeliveryRecipients(ids),
      this.preferences.batch(ids),
    ]);
    const concurrency = this.config.emailDelivery.concurrency;
    for (let index = 0; index < deliveries.length; index += concurrency)
      await Promise.all(
        deliveries
          .slice(index, index + concurrency)
          .map((delivery) =>
            this.process(
              delivery,
              recipients.get(delivery.userId),
              preferences.get(delivery.userId) ??
                DEFAULT_NOTIFICATION_PREFERENCES,
            ),
          ),
      );
    const depth = await this.records.depth();
    this.logger.event('info', 'Email delivery batch processed', {
      operation: 'email_delivery_batch',
      resultCount: deliveries.length,
      pendingCount: depth.pending,
      oldestPendingSeconds: depth.oldestSeconds ?? undefined,
    });
    return deliveries.length;
  }

  private async process(
    delivery: ClaimedDelivery,
    recipient: { email: string; verified: boolean; status: string } | undefined,
    preferences: NotificationPreferenceView,
  ): Promise<void> {
    const started = performance.now();
    const category = preferenceCategory(delivery.template);
    if (!delivery.mandatory) {
      if (!recipient || recipient.status !== 'ACTIVE' || !recipient.verified) {
        await this.records.suppress(delivery.id, 'RECIPIENT_INELIGIBLE');
        return;
      }
      const enabled =
        category === 'MESSAGES'
          ? preferences.messagesEmail
          : category === 'SAVED_SEARCHES'
            ? preferences.savedSearchesEmail
            : category === 'FAVORITES'
              ? preferences.favoritesEmail
              : category === 'MODERATION'
                ? preferences.moderationEmail
                : false;
      if (!enabled) {
        await this.records.suppress(delivery.id, 'PREFERENCE_DISABLED');
        return;
      }
    }
    const to = delivery.recipientEmail ?? recipient?.email;
    if (!to) {
      await this.records.suppress(delivery.id, 'RECIPIENT_UNAVAILABLE');
      return;
    }
    try {
      const rendered = renderEmail(
        this.config,
        delivery.template,
        delivery.payload,
      );
      const result = await this.sender.send({
        to,
        template: delivery.template,
        ...rendered,
        messageId: `<${delivery.id}@marketplace.invalid>`,
        idempotencyKey: delivery.id,
        actionUrl: rendered.actionUrl ?? this.config.webUrl,
      });
      await this.records.sent(delivery.id, result?.providerMessageId ?? null);
      this.log(delivery, 'sent', started);
    } catch (error) {
      if (error instanceof EmailProviderError && error.retryable)
        await this.records.retry(delivery, error.code, error.retryAfterSeconds);
      else
        await this.records.fail(
          delivery.id,
          error instanceof EmailProviderError
            ? error.code
            : 'EMAIL_DELIVERY_FAILED',
        );
      this.log(delivery, 'failed', started);
    }
  }
  private log(
    delivery: ClaimedDelivery,
    result: 'sent' | 'failed',
    started: number,
  ): void {
    const durationMs = Math.round(performance.now() - started);
    this.logger.event(
      result === 'sent' && durationMs < this.config.runtime.slowJobMs
        ? 'info'
        : 'warn',
      durationMs >= this.config.runtime.slowJobMs
        ? 'Slow email delivery completed'
        : 'Email delivery completed',
      {
        operation: 'email_delivery_send',
        entityId: delivery.id,
        notificationId: delivery.notificationId ?? undefined,
        context: delivery.template,
        channel: 'EMAIL',
        attempt: delivery.attempts,
        provider: this.config.emailDelivery.provider,
        result,
        durationMs,
      },
    );
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }
}
