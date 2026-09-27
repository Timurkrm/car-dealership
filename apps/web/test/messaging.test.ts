import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AuthClient } from '../src/features/auth/auth-client';
import {
  MessagingClient,
  parseMessage,
} from '../src/features/messaging/messaging-client';
import { RealtimeClient } from '../src/features/realtime/realtime-provider';
import { mergeMessages } from '../src/features/messaging/message-state';
import type { Socket } from 'socket.io-client';

const ids = {
  conversation: '10000000-0000-4000-8000-000000000001',
  message: '20000000-0000-4000-8000-000000000001',
  client: '30000000-0000-4000-8000-000000000001',
  sender: '40000000-0000-4000-8000-000000000001',
};

test('messaging client preserves clientMessageId across retry and parses durable message', async () => {
  const calls: { url: string; body: string | null }[] = [];
  const auth = new AuthClient(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh'))
      return json({ accessToken: 'token', expiresIn: 300 });
    calls.push({
      url,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return json(message());
  });
  const api = new MessagingClient(auth);
  await api.send(ids.conversation, ids.client, 'hello');
  await api.send(ids.conversation, ids.client, 'hello');
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => JSON.parse(call.body ?? '{}').clientMessageId),
    [ids.client, ids.client],
  );
});

test('message parser rejects private/malformed identities and keeps redaction explicit', () => {
  assert.equal(
    parseMessage({
      ...message(),
      body: null,
      deletedAt: new Date().toISOString(),
    }).body,
    null,
  );
  assert.throws(() => parseMessage({ ...message(), senderId: 'invalid' }));
  assert.equal(
    'sellerEmail' in
      parseMessage({ ...message(), sellerEmail: 'private@example.test' }),
    false,
  );
});

test('messaging client exposes the server-authoritative read-only state', async () => {
  const auth = new AuthClient(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh'))
      return json({ accessToken: 'token', expiresIn: 300 });
    return json({
      id: ids.conversation,
      canSend: false,
      listing: {
        kind: 'UNAVAILABLE',
        listingId: '70000000-0000-4000-8000-000000000001',
        title: 'Removed listing',
      },
      participants: [],
    });
  });
  const detail = await new MessagingClient(auth).detail(ids.conversation);
  assert.equal(detail.canSend, false);
  assert.equal(detail.listing.kind, 'UNAVAILABLE');
});

test('realtime client refreshes once after a server disconnect and logout clears the socket', async () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'http://api.example.test';
  const socket = new FakeSocket();
  const forced: boolean[] = [];
  const client = new RealtimeClient(
    async (force) => {
      forced.push(force === true);
      return 'access-token';
    },
    () => socket as unknown as Socket,
  );
  try {
    await client.connect();
    assert.equal(socket.connectCount, 1);
    socket.trigger('disconnect', 'io server disconnect');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(forced, [true]);
    assert.equal(socket.connectCount, 2);
    socket.trigger('disconnect', 'io server disconnect');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(forced, [true]);
    client.disconnect();
    assert.equal(socket.disconnectCount, 1);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = previous;
  }
});

test('optimistic and durable realtime copies merge by client id and remain ordered', () => {
  const optimistic = {
    ...message(),
    id: ids.client,
    delivery: 'sending' as const,
  };
  const durable = message();
  const earlier = {
    ...message(),
    id: '50000000-0000-4000-8000-000000000001',
    clientMessageId: '60000000-0000-4000-8000-000000000001',
    createdAt: '2026-09-25T09:00:00.000Z',
  };
  const merged = mergeMessages([optimistic], [durable, durable, earlier]);
  assert.deepEqual(
    merged.map((row) => row.id),
    [earlier.id, durable.id],
  );
  assert.equal(merged[1]?.delivery, undefined);
});

class FakeSocket {
  connected = false;
  connectCount = 0;
  disconnectCount = 0;
  private readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();

  on(event: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  connect() {
    this.connectCount += 1;
    this.connected = true;
    return this;
  }

  disconnect() {
    this.disconnectCount += 1;
    this.connected = false;
    return this;
  }

  timeout() {
    return { emit: () => undefined };
  }

  trigger(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

function message() {
  return {
    id: ids.message,
    conversationId: ids.conversation,
    senderId: ids.sender,
    clientMessageId: ids.client,
    body: 'hello',
    createdAt: '2026-09-25T10:00:00.000Z',
    editedAt: null,
    deletedAt: null,
  };
}
function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
