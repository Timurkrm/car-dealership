import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import { RealtimePublisher } from '../../src/platform/realtime/realtime-publisher';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { RequestRateGuard } from '../../src/platform/http/request-rate.guard';
import { AuthTokens } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { PasswordHasher } from '../../src/modules/auth/infrastructure/crypto/password-hasher';
import {
  EmailDeliveryRecords,
  EmailDeliveryWorker,
  EmailProviderError,
  EmailSender,
  NotificationPreferencesService,
  type PreviewEmailSender,
} from '../../src/modules/email-delivery';
import { NotificationWriter } from '../../src/modules/notifications';
import { UserIdentity } from '../../src/modules/users';
import { createSchemaDatabase } from '../support/schema-database';
import {
  fixture,
  seedMarketplaceFixture,
} from '../support/marketplace-fixture';

test(
  'account profile, sessions, preferences, verified email change and durable delivery',
  { timeout: 120000 },
  async (t) => {
    const database = await createSchemaDatabase();
    const { source } = database;
    let app: INestApplication | undefined;
    const disconnectedSessions: string[] = [];
    try {
      const base = loadConfig('test');
      const config = {
        ...base,
        database: { ...base.database, name: String(source.options.database) },
        swagger: true,
      };
      await source.runMigrations();
      await seedMarketplaceFixture(source);
      await source.query(
        'UPDATE users SET email_verified_at=CURRENT_TIMESTAMP; UPDATE user_sessions SET last_used_at=CURRENT_TIMESTAMP',
      );
      const module = await Test.createTestingModule({
        imports: [AppModule.register(config)],
      })
        .overrideProvider(DatabaseConnection)
        .useValue({ source, check: async () => source.query('SELECT 1') })
        .overrideProvider(ObjectStorage)
        .useValue({})
        .overrideProvider(RealtimePublisher)
        .useValue({
          disconnectSession: async (id: string) => {
            disconnectedSessions.push(id);
          },
          notificationCreated: async () => undefined,
          users: async () => undefined,
        })
        .overrideGuard(RequestRateGuard)
        .useValue({ canActivate: () => true, consume: async () => 0 })
        .compile();
      app = module.createNestApplication({ bodyParser: false, logger: false });
      configureApp(app, config);
      await app.listen(0, '127.0.0.1');
      const origin = await app.getUrl();
      const password = 'correct horse marketplace battery';
      const passwordHash = await app.get(PasswordHasher).hash(password);
      await source.query(
        'UPDATE user_credentials SET password_hash=$2 WHERE user_id=$1',
        [fixture.seller, passwordHash],
      );
      const otherSession = randomUUID();
      const buyerSession = randomUUID();
      await source.query(
        `INSERT INTO user_sessions(id,user_id,expires_at,last_used_at)
         VALUES ($1,$2,'2100-01-01',CURRENT_TIMESTAMP),($3,$4,'2100-01-01',CURRENT_TIMESTAMP)`,
        [otherSession, fixture.seller, buyerSession, fixture.buyer],
      );
      const access = await app.get(AuthTokens).issue({
        userId: fixture.seller,
        sessionId: fixture.session,
        roles: ['USER'],
      });
      const request = (
        path: string,
        method = 'GET',
        body?: object,
        token = access,
      ) =>
        fetch(`${origin}/api/v1/${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            origin: config.webUrl,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

      await t.test(
        'profile update is allowlisted and email is not mass assignable',
        async () => {
          const profile = await request('me/profile');
          assert.equal(profile.status, 200);
          assert.equal(
            ((await profile.json()) as { email: string }).email,
            'seller@example.test',
          );
          const updated = await request('me/profile', 'PATCH', {
            displayName: 'Новое имя',
          });
          assert.equal(updated.status, 200);
          assert.equal(
            ((await updated.json()) as { displayName: string }).displayName,
            'Новое имя',
          );
          const injected = await request('me/profile', 'PATCH', {
            displayName: 'Name',
            email: 'attacker@example.test',
          });
          assert.equal(injected.status, 400);
          const rows: Array<{ email: string }> = await source.query(
            'SELECT email_normalized AS email FROM users WHERE id=$1',
            [fixture.seller],
          );
          assert.equal(rows[0]?.email, 'seller@example.test');
        },
      );

      await t.test(
        'typed preference defaults update without disabling mandatory security email',
        async () => {
          const defaults = await request('me/notification-preferences');
          assert.deepEqual(await defaults.json(), {
            messagesEmail: true,
            savedSearchesEmail: false,
            favoritesEmail: true,
            moderationEmail: true,
            securityEmail: true,
          });
          const changed = await request('me/notification-preferences', 'PUT', {
            messagesEmail: false,
            savedSearchesEmail: true,
            favoritesEmail: false,
            moderationEmail: false,
          });
          assert.equal(changed.status, 200);
          const invalid = await request('me/notification-preferences', 'PUT', {
            messagesEmail: false,
            savedSearchesEmail: false,
            favoritesEmail: false,
            moderationEmail: false,
            securityEmail: false,
          });
          assert.equal(invalid.status, 400);
        },
      );

      await t.test(
        'session list marks backend principal and revoke is owner scoped',
        async () => {
          const response = await request('me/sessions');
          const sessions = (await response.json()) as Array<{
            id: string;
            current: boolean;
          }>;
          assert.equal(
            sessions.find((row) => row.id === fixture.session)?.current,
            true,
          );
          assert.equal(
            sessions.find((row) => row.id === otherSession)?.current,
            false,
          );
          assert.equal(
            (await request(`me/sessions/${buyerSession}`, 'DELETE')).status,
            404,
          );
          const revoked = await request(
            'me/sessions/revoke-others',
            'POST',
            {},
          );
          assert.equal(revoked.status, 200);
          assert.equal(
            ((await revoked.json()) as { revoked: number }).revoked,
            1,
          );
          const rows: Array<{ id: string; revoked: Date | null }> =
            await source.query(
              'SELECT id,revoked_at AS revoked FROM user_sessions WHERE id=ANY($1::uuid[]) ORDER BY id',
              [[fixture.session, otherSession]],
            );
          assert.equal(
            rows.find((row) => row.id === fixture.session)?.revoked,
            null,
          );
          assert.ok(rows.find((row) => row.id === otherSession)?.revoked);
          assert.deepEqual(disconnectedSessions, [otherSession]);
        },
      );

      await t.test(
        'email change requires password, replaces token, is single-use and retains current session',
        async () => {
          const denied = await request('me/email-change/request', 'POST', {
            newEmail: 'next@example.test',
            currentPassword: 'wrong password',
          });
          assert.equal(denied.status, 400);
          assert.equal(
            ((await denied.json()) as { code: string }).code,
            'EMAIL_CHANGE_PASSWORD_INVALID',
          );
          const firstAccepted = await request(
            'me/email-change/request',
            'POST',
            {
              newEmail: 'replaced@example.test',
              currentPassword: password,
            },
          );
          assert.equal(firstAccepted.status, 202);
          const preview = app!.get<PreviewEmailSender>(EmailSender);
          const replacedEmail = preview.takeLatest(
            'replaced@example.test',
            'EMAIL_CHANGE',
          );
          assert.ok(replacedEmail);
          const replacedToken = new URLSearchParams(
            new URL(replacedEmail.actionUrl).hash.slice(1),
          ).get('token');
          assert.ok(replacedToken);
          const accepted = await request('me/email-change/request', 'POST', {
            newEmail: 'next@example.test',
            currentPassword: password,
          });
          assert.equal(accepted.status, 202);
          const email = preview.takeLatest('next@example.test', 'EMAIL_CHANGE');
          assert.ok(email);
          const token = new URLSearchParams(
            new URL(email.actionUrl).hash.slice(1),
          ).get('token');
          assert.ok(token);
          const replaced = await request(
            'auth/email-change/confirm',
            'POST',
            { token: replacedToken },
            '',
          );
          assert.equal(replaced.status, 400);
          assert.equal(
            ((await replaced.json()) as { code: string }).code,
            'EMAIL_CHANGE_TOKEN_INVALID',
          );
          const confirmation = await request(
            'auth/email-change/confirm',
            'POST',
            { token },
            '',
          );
          assert.equal(confirmation.status, 204);
          const changed: Array<{ email: string; verified: Date | null }> =
            await source.query(
              'SELECT email_normalized AS email,email_verified_at AS verified FROM users WHERE id=$1',
              [fixture.seller],
            );
          assert.equal(changed[0]?.email, 'next@example.test');
          assert.ok(changed[0]?.verified);
          const current: Array<{ revoked: Date | null }> = await source.query(
            'SELECT revoked_at AS revoked FROM user_sessions WHERE id=$1',
            [fixture.session],
          );
          assert.equal(current[0]?.revoked, null);
          const replay = await request(
            'auth/email-change/confirm',
            'POST',
            { token },
            '',
          );
          assert.equal(replay.status, 400);
          assert.equal(
            ((await replay.json()) as { code: string }).code,
            'EMAIL_CHANGE_TOKEN_INVALID',
          );
          assert.equal(disconnectedSessions.includes(otherSession), true);
          const persisted: Array<{ tokenHash: string }> = await source.query(
            `SELECT token_hash AS "tokenHash" FROM auth_action_tokens
             WHERE user_id=$1 AND purpose='EMAIL_CHANGE'`,
            [fixture.seller],
          );
          assert.equal(
            persisted.some((row) =>
              [token, replacedToken].includes(row.tokenHash),
            ),
            false,
          );
        },
      );

      await t.test(
        'email change rejects expiry, blocked confirmation and a uniqueness race',
        async () => {
          const preview = app!.get<PreviewEmailSender>(EmailSender);
          const issueSeller = async (target: string) => {
            assert.equal(
              (
                await request('me/email-change/request', 'POST', {
                  newEmail: target,
                  currentPassword: password,
                })
              ).status,
              202,
            );
            const email = preview.takeLatest(target, 'EMAIL_CHANGE');
            assert.ok(email);
            const token = new URLSearchParams(
              new URL(email.actionUrl).hash.slice(1),
            ).get('token');
            assert.ok(token);
            return token;
          };
          const expiredToken = await issueSeller('expired-change@example.test');
          await source.query(
            `UPDATE auth_action_tokens SET expires_at=created_at+INTERVAL '1 millisecond'
             WHERE token_hash IS NOT NULL AND purpose='EMAIL_CHANGE' AND user_id=$1 AND revoked_at IS NULL`,
            [fixture.seller],
          );
          const expired = await request(
            'auth/email-change/confirm',
            'POST',
            { token: expiredToken },
            '',
          );
          assert.equal(expired.status, 400);
          assert.equal(
            ((await expired.json()) as { code: string }).code,
            'EMAIL_CHANGE_TOKEN_EXPIRED',
          );
          const blockedToken = await issueSeller('blocked-change@example.test');
          await source.query("UPDATE users SET status='BLOCKED' WHERE id=$1", [
            fixture.seller,
          ]);
          const blocked = await request(
            'auth/email-change/confirm',
            'POST',
            { token: blockedToken },
            '',
          );
          assert.equal(blocked.status, 400);
          await source.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [
            fixture.seller,
          ]);

          const moderatorSession = randomUUID();
          await source.query(
            `INSERT INTO user_credentials(user_id,password_hash) VALUES ($1,$3),($2,$3)`,
            [fixture.buyer, fixture.moderator, passwordHash],
          );
          await source.query(
            `INSERT INTO user_sessions(id,user_id,expires_at,last_used_at)
             VALUES ($1,$2,'2100-01-01',CURRENT_TIMESTAMP)`,
            [moderatorSession, fixture.moderator],
          );
          const buyerAccess = await app!.get(AuthTokens).issue({
            userId: fixture.buyer,
            sessionId: buyerSession,
            roles: ['USER'],
          });
          const moderatorAccess = await app!.get(AuthTokens).issue({
            userId: fixture.moderator,
            sessionId: moderatorSession,
            roles: ['USER', 'MODERATOR'],
          });
          const target = 'race@example.test';
          const issued = await Promise.all([
            request(
              'me/email-change/request',
              'POST',
              { newEmail: target, currentPassword: password },
              buyerAccess,
            ),
            request(
              'me/email-change/request',
              'POST',
              { newEmail: target, currentPassword: password },
              moderatorAccess,
            ),
          ]);
          assert.deepEqual(
            issued.map((response) => response.status),
            [202, 202],
          );
          const tokens = [
            preview.takeLatest(target, 'EMAIL_CHANGE'),
            preview.takeLatest(target, 'EMAIL_CHANGE'),
          ].map((email) => {
            assert.ok(email);
            const token = new URLSearchParams(
              new URL(email.actionUrl).hash.slice(1),
            ).get('token');
            assert.ok(token);
            return token;
          });
          const confirmations = await Promise.all(
            tokens.map((token) =>
              request('auth/email-change/confirm', 'POST', { token }, ''),
            ),
          );
          assert.deepEqual(
            confirmations.map((response) => response.status).sort(),
            [204, 409],
          );
        },
      );

      const records = app.get(EmailDeliveryRecords);
      const preferences = app.get(NotificationPreferencesService);
      const users = app.get(UserIdentity);
      const sender = app.get<PreviewEmailSender>(EmailSender);
      const logger = app.get(StructuredLogger);
      const worker = () =>
        new EmailDeliveryWorker(
          config,
          records,
          preferences,
          users,
          sender,
          logger,
        );
      const notifications = app.get(NotificationWriter);
      const moderationNotification = async (reasonCode: string) =>
        source.transaction((manager) =>
          notifications.moderationResult(
            fixture.seller,
            fixture.listings[0],
            'REJECTED',
            reasonCode,
            '<b>safe seller text</b>',
            manager,
          ),
        );

      await t.test(
        'preference is rechecked before provider send and delivery dedupes',
        async () => {
          const id = await moderationNotification('PREFERENCE_TEST');
          await worker().runOnce();
          let rows: Array<{ status: string }> = await source.query(
            'SELECT status FROM notification_deliveries WHERE notification_id=$1',
            [id],
          );
          assert.equal(rows[0]?.status, 'SUPPRESSED');
          assert.equal(rows.length, 1);
          const mandatoryId = await source.transaction((manager) =>
            notifications.accountStatus(
              fixture.seller,
              'ACTIVE',
              'MANDATORY_TEST',
              manager,
            ),
          );
          await worker().runOnce();
          rows = await source.query(
            'SELECT status FROM notification_deliveries WHERE notification_id=$1',
            [mandatoryId],
          );
          assert.equal(rows[0]?.status, 'SENT');
          await source.query(
            'UPDATE users SET email_verified_at=NULL WHERE id=$1',
            [fixture.seller],
          );
          const unverifiedId = await moderationNotification('UNVERIFIED_TEST');
          await worker().runOnce();
          rows = await source.query(
            'SELECT status FROM notification_deliveries WHERE notification_id=$1',
            [unverifiedId],
          );
          assert.equal(rows[0]?.status, 'SUPPRESSED');
          await source.query(
            'UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=$1',
            [fixture.seller],
          );
        },
      );

      await t.test(
        'transient provider failure retries, permanent failure terminates, and stale lease recovers',
        async () => {
          await preferences.update(fixture.seller, {
            messagesEmail: true,
            savedSearchesEmail: true,
            favoritesEmail: true,
            moderationEmail: true,
          });
          const retryId = await moderationNotification('RETRY_TEST');
          const original = sender.send.bind(sender);
          sender.send = async () => {
            throw new EmailProviderError('EMAIL_PROVIDER_UNAVAILABLE', true);
          };
          await worker().runOnce();
          let rows: Array<{ status: string }> = await source.query(
            'SELECT status FROM notification_deliveries WHERE notification_id=$1',
            [retryId],
          );
          assert.equal(rows[0]?.status, 'RETRY');
          await source.query(
            'UPDATE notification_deliveries SET available_at=CURRENT_TIMESTAMP WHERE notification_id=$1',
            [retryId],
          );
          sender.send = async () => {
            throw new EmailProviderError('EMAIL_PROVIDER_REJECTED', false);
          };
          await worker().runOnce();
          rows = await source.query(
            'SELECT status FROM notification_deliveries WHERE notification_id=$1',
            [retryId],
          );
          assert.equal(rows[0]?.status, 'FAILED');
          sender.send = original;
          const leaseId = await moderationNotification('LEASE_TEST');
          await source.query(
            "UPDATE notification_deliveries SET status='PROCESSING',locked_at=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE notification_id=$1",
            [leaseId],
          );
          await worker().runOnce();
          rows = await source.query(
            'SELECT status FROM notification_deliveries WHERE notification_id=$1',
            [leaseId],
          );
          assert.equal(rows[0]?.status, 'SENT');
        },
      );

      await t.test(
        'concurrent claims never return the same delivery',
        async () => {
          await moderationNotification('CLAIM_ONE');
          await moderationNotification('CLAIM_TWO');
          const [left, right] = await Promise.all([
            records.claim(1),
            records.claim(1),
          ]);
          const leftIds = new Set(left.map((row) => row.id));
          assert.equal(
            right.some((row) => leftIds.has(row.id)),
            false,
          );
          for (const item of [...left, ...right])
            await records.suppress(item.id, 'TEST_CLEANUP');
        },
      );

      await t.test(
        'revoking the current session clears its cookie and disconnects realtime',
        async () => {
          const revoked = await request(
            `me/sessions/${fixture.session}`,
            'DELETE',
          );
          assert.equal(revoked.status, 204);
          assert.match(
            revoked.headers.get('set-cookie') ?? '',
            /Expires=Thu, 01 Jan 1970/,
          );
          assert.equal(disconnectedSessions.includes(fixture.session), true);
          assert.equal((await request('me/profile')).status, 401);
        },
      );
    } finally {
      await app?.close();
      await database.close();
    }
  },
);
