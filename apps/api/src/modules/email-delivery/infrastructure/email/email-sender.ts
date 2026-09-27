import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../../config/config';
import type { AppConfig } from '../../../../config/config';
import type { EmailTemplate } from '../../domain/email-delivery.types';

export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  idempotencyKey: string;
  actionUrl: string;
  expiresAt?: Date;
  requestId?: string | null;
}
export interface EmailSendResult {
  providerMessageId: string | null;
}
export class EmailProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<EmailSendResult | void>;
}

/** Bounded ephemeral local/test capture, never bound in production or logged. */
export class PreviewEmailSender extends EmailSender {
  private readonly messages: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<EmailSendResult | void> {
    this.messages.splice(0, Math.max(0, this.messages.length - 99));
    this.messages.push(message);
    return { providerMessageId: `preview:${message.idempotencyKey}` };
  }
  takeLatest(
    to: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'EMAIL_CHANGE',
  ):
    | {
        to: string;
        purpose: typeof purpose;
        actionUrl: string;
        expiresAt: Date;
        requestId: string | null;
      }
    | undefined {
    const template =
      purpose === 'EMAIL_VERIFICATION'
        ? 'VERIFY_EMAIL'
        : purpose === 'PASSWORD_RESET'
          ? 'PASSWORD_RESET'
          : 'EMAIL_CHANGE_CONFIRMATION';
    for (let index = this.messages.length - 1; index >= 0; index--) {
      const item = this.messages[index];
      if (
        item?.to === to &&
        item.template === template &&
        item.actionUrl &&
        item.expiresAt
      ) {
        this.messages.splice(index, 1);
        return {
          to,
          purpose,
          actionUrl: item.actionUrl,
          expiresAt: item.expiresAt,
          requestId: item.requestId ?? null,
        };
      }
    }
    return undefined;
  }
}

@Injectable()
export class HttpEmailSender extends EmailSender {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const delivery = this.config.emailDelivery;
    if (!delivery.url || !delivery.apiKey)
      throw new EmailProviderError('EMAIL_PROVIDER_NOT_CONFIGURED', false);
    let response: Response;
    try {
      response = await fetch(delivery.url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(delivery.timeoutMs),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${delivery.apiKey}`,
          'idempotency-key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: {
            address: delivery.fromAddress,
            name: delivery.fromName,
          },
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          messageId: message.messageId,
        }),
      });
    } catch {
      throw new EmailProviderError('EMAIL_PROVIDER_TIMEOUT', true);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    const providerMessageId = response.headers.get('x-message-id');
    await response.body?.cancel();
    if (response.ok) return { providerMessageId };
    if (response.status === 429 || response.status >= 500)
      throw new EmailProviderError(
        response.status === 429
          ? 'EMAIL_PROVIDER_RATE_LIMITED'
          : 'EMAIL_PROVIDER_UNAVAILABLE',
        true,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    throw new EmailProviderError('EMAIL_PROVIDER_REJECTED', false);
  }
}
