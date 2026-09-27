import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseConfig } from '../../src/config/config';
import { testEnvironment } from '../fixtures';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  preferenceCategory,
} from '../../src/modules/email-delivery/domain/email-delivery.types';
import {
  escapeHtml,
  renderEmail,
} from '../../src/modules/email-delivery/application/email-templates';
import { EmailProviderError } from '../../src/modules/email-delivery';
import { HttpEmailSender } from '../../src/modules/email-delivery/infrastructure/email/email-sender';

const config = parseConfig(testEnvironment());

test('notification preference defaults are deterministic and security email is immutable', () => {
  assert.deepEqual(DEFAULT_NOTIFICATION_PREFERENCES, {
    messagesEmail: true,
    savedSearchesEmail: false,
    favoritesEmail: true,
    moderationEmail: true,
    securityEmail: true,
  });
  assert.equal(preferenceCategory('NEW_MESSAGE'), 'MESSAGES');
  assert.equal(preferenceCategory('VERIFY_EMAIL'), null);
});

test('typed email templates escape user text and use only canonical app links', () => {
  const message = renderEmail(config, 'NEW_MESSAGE', {
    schemaVersion: 1,
    conversationId: '11111111-1111-4111-8111-111111111111',
    senderPublicName: '<script>alert(1)</script>',
  });
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.equal(
    new URL(message.text.split(' ').at(-1) ?? '').origin,
    config.webUrl,
  );
  assert.equal(escapeHtml(`<&>'"`), '&lt;&amp;&gt;&#39;&quot;');
});

test('security action templates reject Host-style external links and expose text alternative', () => {
  assert.throws(() =>
    renderEmail(config, 'VERIFY_EMAIL', {
      schemaVersion: 1,
      actionUrl: 'https://attacker.example/verify#token=value',
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      requestId: null,
    }),
  );
  const rendered = renderEmail(config, 'PASSWORD_RESET', {
    schemaVersion: 1,
    actionUrl: `${config.webUrl}/reset-password#token=value`,
    expiresAt: new Date(Date.now() + 1000).toISOString(),
    requestId: null,
  });
  assert.ok(rendered.subject && rendered.text && rendered.html);
});

test('provider failures carry safe retry classification without raw response data', () => {
  const transient = new EmailProviderError(
    'EMAIL_PROVIDER_UNAVAILABLE',
    true,
    30,
  );
  assert.equal(transient.retryable, true);
  assert.equal(transient.retryAfterSeconds, 30);
  assert.deepEqual(Object.keys(transient).sort(), [
    'code',
    'retryAfterSeconds',
    'retryable',
  ]);
});

test('HTTP provider sends stable idempotency metadata and classifies timeout, rate and permanent failures', async () => {
  const providerConfig = {
    ...config,
    emailDelivery: {
      ...config.emailDelivery,
      provider: 'http' as const,
      url: 'https://email-gateway.example.test/send',
      apiKey: 'x'.repeat(40),
      timeoutMs: 1000,
    },
  };
  const sender = new HttpEmailSender(providerConfig);
  const message = {
    to: 'recipient@example.test',
    template: 'EMAIL_CHANGED' as const,
    subject: 'Subject',
    text: 'Text',
    html: '<p>Text</p>',
    messageId: '<delivery-id@marketplace.invalid>',
    idempotencyKey: 'delivery-id',
    actionUrl: config.webUrl,
  };
  const original = globalThis.fetch;
  try {
    let captured: RequestInit | undefined;
    globalThis.fetch = async (_input, init) => {
      captured = init;
      return new Response(null, {
        status: 202,
        headers: { 'x-message-id': 'provider-1' },
      });
    };
    assert.deepEqual(await sender.send(message), {
      providerMessageId: 'provider-1',
    });
    assert.equal(
      new Headers(captured?.headers).get('idempotency-key'),
      'delivery-id',
    );
    assert.equal(
      (JSON.parse(String(captured?.body)) as { messageId: string }).messageId,
      message.messageId,
    );

    globalThis.fetch = async () =>
      new Response(null, {
        status: 429,
        headers: { 'retry-after': '45' },
      });
    await assert.rejects(
      sender.send(message),
      (error: unknown) =>
        error instanceof EmailProviderError &&
        error.code === 'EMAIL_PROVIDER_RATE_LIMITED' &&
        error.retryable &&
        error.retryAfterSeconds === 45,
    );
    globalThis.fetch = async () => new Response(null, { status: 422 });
    await assert.rejects(
      sender.send(message),
      (error: unknown) =>
        error instanceof EmailProviderError &&
        error.code === 'EMAIL_PROVIDER_REJECTED' &&
        !error.retryable,
    );
    globalThis.fetch = async () => {
      throw new Error('synthetic network failure');
    };
    await assert.rejects(
      sender.send(message),
      (error: unknown) =>
        error instanceof EmailProviderError &&
        error.code === 'EMAIL_PROVIDER_TIMEOUT' &&
        error.retryable,
    );
  } finally {
    globalThis.fetch = original;
  }
});
