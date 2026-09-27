import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { SignJWT } from 'jose';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { OutboxEventProcessor } from '../../src/engagement/outbox-event-processor';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { RealtimeIoAdapter } from '../../src/platform/realtime/realtime-io.adapter';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { RequestRateGuard } from '../../src/platform/http/request-rate.guard';
import { AuthTokens } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { OutboxRecords } from '../../src/modules/outbox';
import { createSchemaDatabase } from '../support/schema-database';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';
import { seedReadyPhoto } from '../support/ready-media-fixture';
import {
  PART_BRAND_IDS,
  PART_CATEGORY_IDS,
  seedPartCatalog,
} from '../../src/modules/parts/infrastructure/persistence/catalog.seed';

test(
  'Cars/Parts messaging is durable, idempotent, owner-scoped and realtime',
  { timeout: 120000 },
  async (t) => {
    const database = await createSchemaDatabase();
    const { source } = database;
    let app: INestApplication | undefined;
    let socket: Socket | undefined;
    let socketTwo: Socket | undefined;
    try {
      const base = loadConfig('test');
      const config = {
        ...base,
        database: { ...base.database, name: String(source.options.database) },
        swagger: true,
      };
      await source.runMigrations();
      await seedMarketplaceFixture(source);
      await source.transaction(seedPartCatalog);
      await source.query(
        'UPDATE users SET email_verified_at=CURRENT_TIMESTAMP',
      );
      await seedReadyPhoto(source, fixture.listings[1]);
      const partId = randomUUID(),
        partListingId = randomUUID();
      await source.query(
        "INSERT INTO parts(id,category_id,brand_id,name,condition,fitment_mode) VALUES ($1,$2,$3,'Messaging brake pads','NEW','UNIVERSAL')",
        [partId, PART_CATEGORY_IDS.pads, PART_BRAND_IDS.bosch],
      );
      await source.query(
        "INSERT INTO listings(id,seller_id,type,title,price_minor,currency,status,published_at) VALUES ($1,$2,'PART','Messaging brake pads','15000','EUR','PUBLISHED',CURRENT_TIMESTAMP)",
        [partListingId, fixture.seller],
      );
      await source.query(
        'INSERT INTO part_listings(listing_id,part_id,quantity_available) VALUES ($1,$2,2)',
        [partListingId, partId],
      );
      await seedReadyPhoto(source, partListingId);
      const sessions = {
        buyer: randomUUID(),
        seller: randomUUID(),
        outsider: randomUUID(),
      };
      for (const [userId, sessionId] of [
        [fixture.buyer, sessions.buyer],
        [fixture.seller, sessions.seller],
        [fixture.moderator, sessions.outsider],
      ])
        await source.query(
          'INSERT INTO user_sessions(id,user_id,expires_at,last_used_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
          [sessionId, userId, '2100-01-01T00:00:00Z'],
        );
      const module = await Test.createTestingModule({
        imports: [AppModule.register(config)],
      })
        .overrideProvider(DatabaseConnection)
        .useValue({ source, check: async () => source.query('SELECT 1') })
        .overrideProvider(ObjectStorage)
        .useValue({
          readUrl: async () => 'https://processed.example.test/thumbnail.webp',
        })
        .overrideGuard(RequestRateGuard)
        .useValue({ canActivate: () => true, consume: async () => 0 })
        .compile();
      app = module.createNestApplication({ bodyParser: false, logger: false });
      configureApp(app, config);
      const adapter = new RealtimeIoAdapter(
        app,
        config,
        app.get(StructuredLogger),
      );
      await adapter.connect();
      app.useWebSocketAdapter(adapter);
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      const signer = app.get(AuthTokens);
      const tokens = {
        buyer: await signer.issue({
          userId: fixture.buyer,
          sessionId: sessions.buyer,
          roles: ['USER'],
        }),
        seller: await signer.issue({
          userId: fixture.seller,
          sessionId: sessions.seller,
          roles: ['USER'],
        }),
        outsider: await signer.issue({
          userId: fixture.moderator,
          sessionId: sessions.outsider,
          roles: ['USER', 'MODERATOR'],
        }),
      };
      const expiredToken = await new SignJWT({
        sid: sessions.buyer,
        roles: ['USER'],
      })
        .setProtectedHeader({
          alg: 'HS256',
          typ: 'at+jwt',
          kid: config.auth.accessKeyId,
        })
        .setSubject(fixture.buyer)
        .setIssuer('vehicle-marketplace')
        .setAudience('marketplace-web')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 60)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 30)
        .sign(Buffer.from(config.auth.accessSecret, 'hex'));
      const request = (
        path: string,
        token: string,
        method = 'GET',
        body?: object,
      ) =>
        fetch(`${origin}/api/v1/${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

      let conversationId = '';
      await t.test(
        'concurrent open returns one conversation and rejects self-chat',
        async () => {
          const responses = await Promise.all([
            request('conversations', tokens.buyer, 'POST', {
              listingId: fixture.listings[1],
            }),
            request('conversations', tokens.buyer, 'POST', {
              listingId: fixture.listings[1],
            }),
          ]);
          assert.deepEqual(
            responses.map((row) => row.status),
            [200, 200],
          );
          const bodies = (await Promise.all(
            responses.map((row) => row.json()),
          )) as { id: string }[];
          assert.equal(bodies[0]?.id, bodies[1]?.id);
          conversationId = bodies[0]!.id;
          const count: { count: string }[] = await source.query(
            'SELECT count(*) FROM conversations WHERE listing_id=$1 AND buyer_id=$2',
            [fixture.listings[1], fixture.buyer],
          );
          assert.equal(count[0]?.count, '1');
          assert.equal(
            (
              await request('conversations', tokens.seller, 'POST', {
                listingId: fixture.listings[1],
              })
            ).status,
            400,
          );
        },
      );

      await t.test(
        'Part listing uses the same conversation contract',
        async () => {
          const opened = await request('conversations', tokens.buyer, 'POST', {
            listingId: partListingId,
          });
          assert.equal(opened.status, 200);
          const partConversation = (await opened.json()) as { id: string };
          const detail = await request(
            `me/conversations/${partConversation.id}`,
            tokens.buyer,
          );
          assert.equal(detail.status, 200);
          const body = (await detail.json()) as {
            listing: { type: string; listingId: string };
          };
          assert.equal(body.listing.type, 'PART');
          assert.equal(body.listing.listingId, partListingId);
          const firstPageResponse = await request(
            'me/conversations?limit=1',
            tokens.buyer,
          );
          const firstPage = (await firstPageResponse.json()) as {
            items: { id: string }[];
            page: { hasNextPage: boolean; nextCursor: string | null };
          };
          assert.equal(firstPage.page.hasNextPage, true);
          assert.ok(firstPage.page.nextCursor);
          const secondPage = (await (
            await request(
              `me/conversations?limit=1&cursor=${encodeURIComponent(firstPage.page.nextCursor!)}`,
              tokens.buyer,
            )
          ).json()) as { items: { id: string }[] };
          assert.equal(secondPage.items.length, 1);
          assert.notEqual(secondPage.items[0]?.id, firstPage.items[0]?.id);
        },
      );

      const clientMessageId = randomUUID();
      let messageId = '';
      let realtimeMessageId = '';
      await t.test(
        'send retry is idempotent, conflict is rejected and outbox is atomic',
        async () => {
          const [first, retry] = await Promise.all([
            request(
              `me/conversations/${conversationId}/messages`,
              tokens.buyer,
              'POST',
              { clientMessageId, body: 'Is it still available?' },
            ),
            request(
              `me/conversations/${conversationId}/messages`,
              tokens.buyer,
              'POST',
              { clientMessageId, body: 'Is it still available?' },
            ),
          ]);
          assert.deepEqual([first.status, retry.status], [200, 200]);
          const messages = (await Promise.all([
            first.json(),
            retry.json(),
          ])) as { id: string; body: string }[];
          messageId = messages[0]!.id;
          assert.equal(messages[1]!.id, messageId);
          const conflict = await request(
            `me/conversations/${conversationId}/messages`,
            tokens.buyer,
            'POST',
            { clientMessageId, body: 'Different body' },
          );
          assert.equal(conflict.status, 409);
          const counts: { messages: string; events: string }[] =
            await source.query(
              `SELECT (SELECT count(*) FROM messages WHERE conversation_id=$1 AND client_message_id=$2)::text AS messages,
                (SELECT count(*) FROM outbox_events WHERE type='MESSAGE_CREATED' AND aggregate_id=$3)::text AS events`,
              [conversationId, clientMessageId, messageId],
            );
          assert.deepEqual(counts[0], { messages: '1', events: '1' });
        },
      );

      await t.test(
        'history is owner scoped, cursor bounded and read watermark is monotonic',
        async () => {
          assert.equal(
            (
              await request(
                `me/conversations/${conversationId}`,
                tokens.outsider,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await request(
                `me/conversations/${conversationId}/messages`,
                tokens.outsider,
              )
            ).status,
            404,
          );
          const history = await request(
            `me/conversations/${conversationId}/messages?limit=1`,
            tokens.seller,
          );
          assert.equal(history.status, 200);
          const page = (await history.json()) as { items: { id: string }[] };
          assert.equal(page.items[0]?.id, messageId);
          const read = await request(
            `me/conversations/${conversationId}/read`,
            tokens.seller,
            'POST',
            { messageId },
          );
          assert.equal(read.status, 200);
          await request(
            `me/conversations/${conversationId}/read`,
            tokens.seller,
            'POST',
            { messageId },
          );
          const unread = (await (
            await request('me/conversations/unread-count', tokens.seller)
          ).json()) as { count: number };
          // The seeded first-listing conversation remains unread; this conversation does not.
          assert.equal(unread.count, 1);
        },
      );

      await t.test(
        'worker creates one recipient notification and replay is deduplicated',
        async () => {
          const outbox = app!.get(OutboxRecords),
            processor = app!.get(OutboxEventProcessor);
          const events = await outbox.claim();
          for (const event of events) await processor.process(event);
          const notification: { count: string }[] = await source.query(
            `SELECT count(*) FROM notifications notification
         JOIN outbox_events event ON event.id=notification.source_event_id
         WHERE event.type='MESSAGE_CREATED' AND event.aggregate_id=$1 AND notification.user_id=$2`,
            [messageId, fixture.seller],
          );
          assert.equal(notification[0]?.count, '1');
          const sender: { count: string }[] = await source.query(
            `SELECT count(*) FROM notifications notification
         JOIN outbox_events event ON event.id=notification.source_event_id
         WHERE event.type='MESSAGE_CREATED' AND event.aggregate_id=$1 AND notification.user_id=$2`,
            [messageId, fixture.buyer],
          );
          assert.equal(sender[0]?.count, '0');
        },
      );

      await t.test(
        'socket handshake rejects query tokens, bad origins, expired tokens and inactive accounts',
        async () => {
          assert.equal(
            await connectionError(`${origin}/realtime`, {
              query: { accessToken: tokens.buyer },
              extraHeaders: { Origin: config.webUrl },
            }),
            'REALTIME_QUERY_TOKEN_FORBIDDEN',
          );
          assert.equal(
            await connectionError(`${origin}/realtime`, {
              auth: { accessToken: tokens.buyer },
              extraHeaders: { Origin: 'https://attacker.example' },
            }),
            'REALTIME_ORIGIN_REJECTED',
          );
          assert.equal(
            await connectionError(`${origin}/realtime`, {
              auth: { accessToken: expiredToken },
              extraHeaders: { Origin: config.webUrl },
            }),
            'AUTHENTICATION_REQUIRED',
          );
          for (const status of ['SUSPENDED', 'BLOCKED'] as const) {
            await source.query('UPDATE users SET status=$1 WHERE id=$2', [
              status,
              fixture.moderator,
            ]);
            assert.equal(
              await connectionError(`${origin}/realtime`, {
                auth: { accessToken: tokens.outsider },
                extraHeaders: { Origin: config.webUrl },
              }),
              status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_BLOCKED',
            );
          }
          await source.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [
            fixture.moderator,
          ]);
        },
      );

      await t.test(
        'authenticated socket receives committed message and rejects unauthorized room',
        async () => {
          socket = io(`${origin}/realtime`, {
            transports: ['websocket'],
            auth: { accessToken: tokens.seller },
            extraHeaders: { Origin: config.webUrl },
          });
          await new Promise<void>((resolve, reject) => {
            socket!.once('connect', resolve);
            socket!.once('connect_error', reject);
          });
          socketTwo = io(`${origin}/realtime`, {
            transports: ['websocket'],
            auth: { accessToken: tokens.seller },
            extraHeaders: { Origin: config.webUrl },
          });
          await new Promise<void>((resolve, reject) => {
            socketTwo!.once('connect', resolve);
            socketTwo!.once('connect_error', reject);
          });
          const subscribe = await command(socket, 'conversation:subscribe', {
            conversationId,
          });
          assert.equal(subscribe.ok, true);
          const forbidden = await command(socket, 'conversation:subscribe', {
            conversationId: randomUUID(),
          });
          assert.equal(forbidden.ok, false);
          const event = new Promise<{ body: string }>((resolve) =>
            socket!.once('message:created', resolve),
          );
          const secondDeviceEvent = new Promise<{ body: string }>((resolve) =>
            socketTwo!.once('message:created', resolve),
          );
          const response = await request(
            `me/conversations/${conversationId}/messages`,
            tokens.buyer,
            'POST',
            {
              clientMessageId: randomUUID(),
              body: 'Realtime after commit',
            },
          );
          assert.equal(response.status, 200);
          realtimeMessageId = ((await response.json()) as { id: string }).id;
          assert.equal((await event).body, 'Realtime after commit');
          assert.equal((await secondDeviceEvent).body, 'Realtime after commit');
        },
      );

      await t.test(
        'concurrent older read cannot move a newer watermark backwards',
        async () => {
          const newestPage = (await (
            await request(
              `me/conversations/${conversationId}/messages?limit=1`,
              tokens.seller,
            )
          ).json()) as {
            items: { id: string }[];
            page: { hasNextPage: boolean; nextCursor: string | null };
          };
          assert.equal(newestPage.items[0]?.id, realtimeMessageId);
          assert.ok(newestPage.page.nextCursor);
          const olderPage = (await (
            await request(
              `me/conversations/${conversationId}/messages?limit=1&cursor=${encodeURIComponent(newestPage.page.nextCursor!)}`,
              tokens.seller,
            )
          ).json()) as { items: { id: string }[] };
          assert.equal(olderPage.items[0]?.id, messageId);
          const reads = await Promise.all([
            request(
              `me/conversations/${conversationId}/read`,
              tokens.seller,
              'POST',
              {
                messageId: realtimeMessageId,
              },
            ),
            request(
              `me/conversations/${conversationId}/read`,
              tokens.seller,
              'POST',
              {
                messageId,
              },
            ),
          ]);
          assert.deepEqual(
            reads.map((response) => response.status),
            [200, 200],
          );
          const pointer: { last_read_message_id: string }[] =
            await source.query(
              `SELECT last_read_message_id FROM conversation_participants
         WHERE conversation_id=$1 AND user_id=$2`,
              [conversationId, fixture.seller],
            );
          assert.equal(pointer[0]?.last_read_message_id, realtimeMessageId);
        },
      );

      await t.test(
        'archived listing keeps history but returns only a safe unavailable reference',
        async () => {
          await source.query(
            "UPDATE listings SET status='ARCHIVED', archived_at=CURRENT_TIMESTAMP WHERE id=$1",
            [fixture.listings[1]],
          );
          const detail = await request(
            `me/conversations/${conversationId}`,
            tokens.buyer,
          );
          assert.equal(detail.status, 200);
          const body = (await detail.json()) as {
            listing: Record<string, unknown>;
            canSend: boolean;
          };
          assert.equal(body.canSend, true);
          assert.deepEqual(Object.keys(body.listing).sort(), [
            'kind',
            'listingId',
            'title',
          ]);
          assert.equal(body.listing.kind, 'UNAVAILABLE');
          assert.equal(
            (
              await request(
                `me/conversations/${conversationId}/messages`,
                tokens.buyer,
              )
            ).status,
            200,
          );
          const archivedSend = await request(
            `me/conversations/${conversationId}/messages`,
            tokens.buyer,
            'POST',
            {
              clientMessageId: randomUUID(),
              body: 'Archived by the seller remains writable',
            },
          );
          assert.equal(archivedSend.status, 200);
        },
      );

      await t.test(
        'a revoked persisted session is disconnected on the next command',
        async () => {
          assert.equal(socket?.connected, true);
          const disconnected = new Promise<void>((resolve) =>
            socket!.once('disconnect', () => resolve()),
          );
          await source.query(
            'UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1',
            [sessions.seller],
          );
          await command(socket!, 'conversation:subscribe', {
            conversationId,
          }).catch(() => ({ ok: false }));
          await disconnected;
          assert.equal(socket?.connected, false);
        },
      );
    } finally {
      socket?.disconnect();
      socketTwo?.disconnect();
      if (app) await app.close();
      await database.close();
    }
  },
);

function command(
  socket: Socket,
  event: string,
  payload: object,
): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    socket
      .timeout(5000)
      .emit(event, payload, (error: Error | null, response: { ok: boolean }) =>
        error ? reject(error) : resolve(response),
      );
  });
}

async function connectionError(
  url: string,
  options: {
    auth?: { accessToken: string };
    query?: { accessToken: string };
    extraHeaders: { Origin: string };
  },
): Promise<string> {
  const candidate = io(url, {
    ...options,
    transports: ['websocket'],
    reconnection: false,
    timeout: 3000,
  });
  return new Promise((resolve, reject) => {
    candidate.once('connect', () => {
      candidate.disconnect();
      reject(new Error('Unexpected socket connection'));
    });
    candidate.once('connect_error', (error) => {
      candidate.disconnect();
      resolve(error.message);
    });
  });
}
