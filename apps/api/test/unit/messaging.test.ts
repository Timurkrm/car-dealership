import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiException } from '../../src/platform/http/api-error';
import { loadConfig } from '../../src/config/config';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import { RealtimePublisher } from '../../src/platform/realtime/realtime-publisher';
import { normalizeMessage } from '../../src/modules/messaging/application/message-commands';
import { notificationPayload } from '../../src/modules/notifications';
import { parseMessageCreatedPayload } from '../../src/modules/outbox';

const ids = {
  message: '10000000-0000-4000-8000-000000000001',
  conversation: '20000000-0000-4000-8000-000000000001',
  listing: '30000000-0000-4000-8000-000000000001',
  sender: '40000000-0000-4000-8000-000000000001',
};

test('message normalization is plain text, deterministic and code-point bounded', () => {
  assert.equal(normalizeMessage('  hello\r\nworld  '), 'hello\nworld');
  assert.equal(normalizeMessage('e\u0301'), 'é');
  assert.throws(
    () => normalizeMessage('   '),
    (error: unknown) =>
      error instanceof ApiException && error.code === 'MESSAGE_INVALID_BODY',
  );
  assert.throws(() => normalizeMessage('x'.repeat(8001)));
  assert.equal(normalizeMessage('😀'.repeat(8000)).length, 16000);
});

test('MESSAGE_CREATED outbox payload is strict and versioned', () => {
  const payload = {
    schemaVersion: 1 as const,
    messageId: ids.message,
    conversationId: ids.conversation,
    listingId: ids.listing,
    senderId: ids.sender,
  };
  assert.deepEqual(parseMessageCreatedPayload(payload), payload);
  assert.throws(() =>
    parseMessageCreatedPayload({ ...payload, body: 'private' }),
  );
  assert.throws(() =>
    parseMessageCreatedPayload({ ...payload, messageId: 'not-a-uuid' }),
  );
});

test('NEW_MESSAGE notification contains navigation metadata and no private body', () => {
  assert.deepEqual(
    notificationPayload('NEW_MESSAGE', {
      conversationId: ids.conversation,
      messageId: ids.message,
      listingId: ids.listing,
      senderPublicName: 'Buyer',
    }),
    {
      schemaVersion: 1,
      conversationId: ids.conversation,
      messageId: ids.message,
      listingId: ids.listing,
      senderPublicName: 'Buyer',
    },
  );
  assert.throws(() =>
    notificationPayload('NEW_MESSAGE', {
      conversationId: ids.conversation,
      messageId: ids.message,
      listingId: ids.listing,
      senderPublicName: 'Buyer',
      body: 'must never be copied',
    }),
  );
});

test('realtime broadcast failure is contained after the durable boundary', async () => {
  const config = { ...loadConfig('test'), logLevel: 'error' as const };
  const publisher = new RealtimePublisher(config, new StructuredLogger(config));
  Object.defineProperty(publisher, 'emitter', {
    value: {
      of: () => ({
        to: () => ({
          emit: () => {
            throw new Error('redis unavailable');
          },
        }),
      }),
    },
  });
  await assert.doesNotReject(() =>
    publisher.users([ids.sender], 'message:created', { id: ids.message }),
  );
  await publisher.onApplicationShutdown();
});
