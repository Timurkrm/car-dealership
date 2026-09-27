import type { AppConfig } from '../../../config/config';
import type { EmailTemplate } from '../domain/email-delivery.types';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  actionUrl?: string;
  expiresAt?: Date;
  requestId?: string | null;
}

const stringValue = (
  payload: Record<string, unknown>,
  key: string,
  maximum = 2048,
): string => {
  const value = payload[key];
  if (typeof value !== 'string' || !value || value.length > maximum)
    throw new Error('EMAIL_TEMPLATE_INVALID_PAYLOAD');
  return value;
};
const optionalString = (
  payload: Record<string, unknown>,
  key: string,
  maximum = 2048,
): string | undefined => {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error('EMAIL_TEMPLATE_INVALID_PAYLOAD');
  return value;
};
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
const paragraph = (value: string) => `<p>${escapeHtml(value)}</p>`;
const link = (label: string, url: string) =>
  `<p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p>`;

function internalUrl(config: AppConfig, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('EMAIL_TEMPLATE_INVALID_LINK');
  return new URL(path, `${config.webUrl}/`).toString();
}

function actionPayload(
  config: AppConfig,
  payload: Record<string, unknown>,
): { actionUrl: string; expiresAt: Date; requestId: string | null } {
  const actionUrl = stringValue(payload, 'actionUrl', 2048);
  const parsed = new URL(actionUrl);
  if (parsed.origin !== new URL(config.webUrl).origin)
    throw new Error('EMAIL_TEMPLATE_INVALID_LINK');
  const expiresAt = new Date(stringValue(payload, 'expiresAt', 64));
  if (!Number.isFinite(expiresAt.getTime()))
    throw new Error('EMAIL_TEMPLATE_INVALID_PAYLOAD');
  const requestId = payload.requestId;
  if (
    requestId !== null &&
    requestId !== undefined &&
    typeof requestId !== 'string'
  )
    throw new Error('EMAIL_TEMPLATE_INVALID_PAYLOAD');
  return {
    actionUrl,
    expiresAt,
    requestId: typeof requestId === 'string' ? requestId : null,
  };
}

export function renderEmail(
  config: AppConfig,
  template: EmailTemplate,
  payload: Record<string, unknown>,
): RenderedEmail {
  if (payload.schemaVersion !== 1)
    throw new Error('EMAIL_TEMPLATE_INVALID_PAYLOAD');
  if (
    template === 'VERIFY_EMAIL' ||
    template === 'PASSWORD_RESET' ||
    template === 'EMAIL_CHANGE_CONFIRMATION'
  ) {
    const action = actionPayload(config, payload);
    const content: readonly [string, string] =
      template === 'VERIFY_EMAIL'
        ? ['Подтвердите email', 'Подтвердить email']
        : template === 'PASSWORD_RESET'
          ? ['Восстановление пароля', 'Задать новый пароль']
          : ['Подтвердите новый email', 'Подтвердить новый email'];
    const text = `${content[0]}. ${action.actionUrl}`;
    return {
      subject: content[0],
      text,
      html: `${paragraph(content[0])}${link(content[1], action.actionUrl)}`,
      ...action,
    };
  }
  if (template === 'EMAIL_CHANGED') {
    const text =
      'Email вашего аккаунта изменён. Если это были не вы, восстановите доступ и обратитесь в поддержку.';
    return { subject: 'Email аккаунта изменён', text, html: paragraph(text) };
  }
  if (template === 'NEW_MESSAGE') {
    const sender = stringValue(payload, 'senderPublicName', 100);
    const url = internalUrl(
      config,
      `/account/messages/${stringValue(payload, 'conversationId', 64)}`,
    );
    const text = `У вас новое сообщение от ${sender}. Открыть диалог: ${url}`;
    return {
      subject: 'Новое сообщение',
      text,
      html: `${paragraph(`У вас новое сообщение от ${sender}.`)}${link('Открыть диалог', url)}`,
    };
  }
  if (template === 'SAVED_SEARCH_MATCH') {
    const listingId = stringValue(payload, 'listingId', 64);
    const path =
      payload.listingType === 'PART'
        ? `/parts/${listingId}`
        : `/cars/${listingId}`;
    const url = internalUrl(config, path);
    const text = `Появилось новое объявление по сохранённому поиску. ${url}`;
    return {
      subject: 'Новое объявление по сохранённому поиску',
      text,
      html: `${paragraph('Появилось новое объявление по сохранённому поиску.')}${link('Открыть объявление', url)}`,
    };
  }
  if (template === 'FAVORITE_STATUS_CHANGED') {
    const text = 'Объявление из избранного больше недоступно.';
    return {
      subject: 'Статус объявления изменён',
      text,
      html: paragraph(text),
    };
  }
  if (template === 'MODERATION_RESULT') {
    const status = stringValue(payload, 'status', 32);
    const message = optionalString(payload, 'message', 2000);
    const base =
      status === 'PUBLISHED'
        ? 'Объявление прошло модерацию.'
        : 'Статус объявления после модерации изменён.';
    const text = message ? `${base} ${message}` : base;
    return {
      subject: 'Результат модерации объявления',
      text,
      html: `${paragraph(base)}${message ? paragraph(message) : ''}`,
    };
  }
  if (template === 'ACCOUNT_STATUS_CHANGED') {
    const status = stringValue(payload, 'accountStatus', 32);
    const text = `Статус вашего аккаунта изменён: ${status}.`;
    return {
      subject: 'Статус аккаунта изменён',
      text,
      html: paragraph(text),
    };
  }
  throw new Error('EMAIL_TEMPLATE_UNSUPPORTED');
}

export { escapeHtml };
