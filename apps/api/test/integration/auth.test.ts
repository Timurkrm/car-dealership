import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { decodeJwt } from 'jose';
import { hash, argon2id } from 'argon2';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadConfig } from '../../src/config/config';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { RedisConnection } from '../../src/platform/redis/redis.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import type { LogFields } from '../../src/platform/logging/structured-logger';
import type { LogLevel } from '../../src/config/config';
import { AuditWriter } from '../../src/modules/audit';
import {
  AuthenticationGuard,
  RolesGuard,
  RequireRoles,
  AuthModule,
} from '../../src/modules/auth';
import { EmailSender } from '../../src/modules/auth/infrastructure/email/email-sender';
import type { PreviewEmailSender } from '../../src/modules/auth/infrastructure/email/email-sender';
import { AuthRateLimiter } from '../../src/modules/auth/http/auth-rate.guard';
import { AuthPersistence } from '../../src/modules/auth/infrastructure/persistence/auth.persistence';
import { SessionService } from '../../src/modules/auth/application/session.service';
import { tokenDigest } from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { PasswordHasher } from '../../src/modules/auth/infrastructure/crypto/password-hasher';
import { createSchemaDatabase } from '../support/schema-database';

@Controller({ path: 'auth-test', version: '1' })
@UseGuards(AuthenticationGuard, RolesGuard)
class RoleTestController {
  @Get('user') @RequireRoles('USER') user() {
    return { allowed: true };
  }
  @Get('moderator') @RequireRoles('MODERATOR') moderator() {
    return { allowed: true };
  }
  @Get('admin') @RequireRoles('ADMIN') admin() {
    return { allowed: true };
  }
}
class CaptureLogger extends StructuredLogger {
  readonly events: string[] = [];
  override event(
    level: LogLevel,
    message: string,
    fields: LogFields = {},
  ): void {
    this.events.push(JSON.stringify({ level, message, ...fields }));
  }
}
interface Grant {
  access: string;
  cookie: string;
  sid: string;
}
test(
  'browser authentication with owned PostgreSQL database and real isolated Redis',
  { timeout: 180000 },
  async (t) => {
    const database = await createSchemaDatabase();
    const { source } = database;
    const base = loadConfig('test');
    const config = {
      ...base,
      database: { ...base.database, name: String(source.options.database) },
      swagger: true,
    };
    const logger = new CaptureLogger(config);
    const redis = new RedisConnection(config, logger);
    const limiter = new AuthRateLimiter(config, redis);
    const realConsume = limiter.consume.bind(limiter);
    let realRate = false;
    limiter.consume = async (...args) => {
      if (realRate) await realConsume(...args);
    };
    const audit = new AuditWriter(source);
    const realAppend = audit.append.bind(audit);
    let failAudit = false;
    audit.append = async (entry, manager) => {
      if (failAudit && entry.action === 'AUTH_REGISTERED')
        throw new Error('simulated audit failure');
      return realAppend(entry, manager);
    };
    await source.runMigrations();
    const module = await Test.createTestingModule({
      imports: [AppModule.register(config), AuthModule],
      controllers: [RoleTestController],
    })
      .overrideProvider(DatabaseConnection)
      .useValue({
        source,
        check: async () => {
          await source.query('SELECT 1');
        },
      })
      .overrideProvider(RedisConnection)
      .useValue(redis)
      .overrideProvider(ObjectStorage)
      .useValue({})
      .overrideProvider(StructuredLogger)
      .useValue(logger)
      .overrideProvider(AuthRateLimiter)
      .useValue(limiter)
      .overrideProvider(AuditWriter)
      .useValue(audit)
      .compile();
    const app = module.createNestApplication({
      bodyParser: false,
      logger: false,
    });
    configureApp(app, config);
    const preview = app.get<PreviewEmailSender>(EmailSender);
    const password = 'correct horse marketplace battery';
    const newPassword = 'a completely different safe passphrase';
    const secrets: string[] = [password, newPassword, config.auth.accessSecret];
    let origin = '';
    const post = (
      path: string,
      body: object = {},
      grant?: Grant,
      headers: Record<string, string> = {},
    ) =>
      fetch(`${origin}/api/v1/auth/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: config.webUrl,
          ...(grant
            ? { cookie: grant.cookie, authorization: `Bearer ${grant.access}` }
            : {}),
          ...headers,
        },
        body: JSON.stringify(body),
      });
    const code = async (
      response: Response,
      status: number,
      expected: string,
    ) => {
      assert.equal(response.status, status);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body: unknown = await response.json();
      assert.ok(body && typeof body === 'object' && 'code' in body);
      assert.equal(body.code, expected);
    };
    const grantFrom = async (response: Response): Promise<Grant> => {
      assert.equal(
        response.status,
        200,
        `${await response.clone().text()}\n${logger.events.slice(-6).join('\n')}`,
      );
      const value: unknown = await response.json();
      assert.ok(
        value &&
          typeof value === 'object' &&
          'accessToken' in value &&
          typeof value.accessToken === 'string' &&
          'expiresIn' in value,
      );
      assert.deepEqual(Object.keys(value).sort(), ['accessToken', 'expiresIn']);
      const header = response.headers.get('set-cookie');
      assert.ok(header);
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Strict/);
      assert.match(header, /Path=\/api\/v1\/auth/);
      assert.equal(header.includes('Domain='), false);
      const cookie = header.split(';')[0];
      assert.ok(cookie);
      const sid = decodeJwt(value.accessToken).sid;
      assert.equal(typeof sid, 'string');
      assert.ok(typeof sid === 'string');
      secrets.push(value.accessToken, cookie.slice(cookie.indexOf('=') + 1));
      return { access: value.accessToken, cookie, sid };
    };
    const login = (email: string, pw = password) =>
      post('login', { email, password: pw }).then(grantFrom);
    const me = (grant?: Grant) =>
      fetch(`${origin}/api/v1/auth/me`, {
        headers: grant ? { authorization: `Bearer ${grant.access}` } : {},
      });
    const actionToken = (
      email: string,
      purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    ): string => {
      const mail = preview.takeLatest(email, purpose);
      assert.ok(mail);
      assert.equal(new URL(mail.actionUrl).origin, config.webUrl);
      assert.equal(new URL(mail.actionUrl).search, '');
      const token = new URLSearchParams(
        new URL(mail.actionUrl).hash.slice(1),
      ).get('token');
      assert.ok(token);
      secrets.push(token);
      return token;
    };
    const register = async (email: string, verify = true): Promise<string> => {
      const response = await post('register', {
        email,
        displayName: ' Test Seller ',
        password,
      });
      assert.equal(response.status, 201);
      const token = actionToken(
        email.toLowerCase().trim(),
        'EMAIL_VERIFICATION',
      );
      if (verify)
        assert.equal(
          (await post('email-verification/confirm', { token })).status,
          204,
        );
      const users: { id: string }[] = await source.query(
        'SELECT id FROM users WHERE email_normalized = $1',
        [email.toLowerCase().trim()],
      );
      assert.ok(users[0]);
      return users[0].id;
    };
    try {
      await app.listen(0, '127.0.0.1');
      origin = await app.getUrl();
      await t.test(
        'registration canonicalizes email, hashes password and creates default role atomically',
        async () => {
          const response = await post('register', {
            email: ' Seller@Example.Test ',
            password,
            displayName: ' Seller ',
          });
          assert.equal(response.status, 201);
          assert.equal(response.headers.get('set-cookie'), null);
          const users: {
            id: string;
            status: string;
            display_name: string;
            email_verified_at: Date | null;
            password_hash: string;
            role: string;
          }[] = await source.query(
            'SELECT u.id, u.status, u.display_name, u.email_verified_at, c.password_hash, r.role FROM users u JOIN user_credentials c ON c.user_id=u.id JOIN user_roles r ON r.user_id=u.id WHERE u.email_normalized=$1',
            ['seller@example.test'],
          );
          assert.equal(users.length, 1);
          assert.equal(users[0]?.role, 'USER');
          assert.equal(users[0]?.status, 'PENDING_VERIFICATION');
          assert.equal(users[0]?.display_name, 'Seller');
          assert.equal(users[0]?.email_verified_at, null);
          assert.match(users[0]?.password_hash ?? '', /^\$argon2id\$/);
          await code(
            await post('register', {
              email: 'SELLER@example.test',
              password,
              displayName: 'x',
            }),
            409,
            'EMAIL_ALREADY_REGISTERED',
          );
          await code(
            await post('register', {
              email: 'short@example.test',
              password: 'short',
              displayName: 'x',
            }),
            400,
            'PASSWORD_POLICY_VIOLATION',
          );
          await code(
            await post('register', {
              email: 'invalid',
              password,
              displayName: 'x',
              roles: ['ADMIN'],
            }),
            400,
            'VALIDATION_ERROR',
          );
          failAudit = true;
          assert.equal(
            (
              await post('register', {
                email: 'rollback@example.test',
                password,
                displayName: 'x',
              })
            ).status,
            500,
          );
          failAudit = false;
          const rolled: { count: string }[] = await source.query(
            "SELECT count(*) FROM users WHERE email_normalized = 'rollback@example.test'",
          );
          assert.equal(rolled[0]?.count, '0');
          assert.equal(
            preview.takeLatest('rollback@example.test', 'EMAIL_VERIFICATION'),
            undefined,
          );
        },
      );
      await t.test(
        'pending account cannot login; verification is generic, replaces old token and is single-use',
        async () => {
          await code(
            await post('login', { email: 'seller@example.test', password }),
            403,
            'EMAIL_VERIFICATION_REQUIRED',
          );
          const first = actionToken(
            'seller@example.test',
            'EMAIL_VERIFICATION',
          );
          const known = await post('email-verification/request', {
            email: 'SELLER@example.test',
          });
          const unknown = await post('email-verification/request', {
            email: 'unknown@example.test',
          });
          assert.equal(known.status, 202);
          assert.equal(unknown.status, 202);
          assert.deepEqual(await known.json(), await unknown.json());
          const replacement = actionToken(
            'seller@example.test',
            'EMAIL_VERIFICATION',
          );
          await code(
            await post('email-verification/confirm', { token: first }),
            400,
            'INVALID_VERIFICATION_TOKEN',
          );
          assert.equal(
            (await post('email-verification/confirm', { token: replacement }))
              .status,
            204,
          );
          await code(
            await post('email-verification/confirm', { token: replacement }),
            400,
            'INVALID_VERIFICATION_TOKEN',
          );
          const rows: { status: string; email_verified_at: Date }[] =
            await source.query(
              "SELECT status,email_verified_at FROM users WHERE email_normalized='seller@example.test'",
            );
          assert.equal(rows[0]?.status, 'ACTIVE');
          assert.ok(rows[0]?.email_verified_at);
        },
      );
      await t.test(
        'email adapter failure leaves committed identity/token state intact and recovery stays generic',
        async () => {
          const original = preview.send.bind(preview);
          preview.send = async (mail) => {
            if (mail.to === 'delivery@example.test') {
              secrets.push(
                new URLSearchParams(new URL(mail.actionUrl).hash.slice(1)).get(
                  'token',
                ) ?? 'unused-test-secret',
              );
              throw new Error(mail.actionUrl);
            }
            await original(mail);
          };
          try {
            const response = await post('register', {
              email: 'delivery@example.test',
              displayName: 'Delivery Test',
              password,
            });
            assert.equal(response.status, 201);
            const rows: { count: string }[] = await source.query(
              "SELECT count(*) FROM users u JOIN user_roles r ON r.user_id=u.id JOIN user_credentials c ON c.user_id=u.id JOIN auth_action_tokens t ON t.user_id=u.id WHERE u.email_normalized='delivery@example.test'",
            );
            assert.equal(rows[0]?.count, '1');
            const known = await post('password/forgot', {
              email: 'delivery@example.test',
            });
            const unknown = await post('password/forgot', {
              email: 'missing-delivery@example.test',
            });
            assert.equal(known.status, 202);
            assert.equal(unknown.status, 202);
            assert.deepEqual(await known.json(), await unknown.json());
            assert.ok(
              logger.events.some((event) =>
                event.includes('auth_email_delivery'),
              ),
            );
          } finally {
            preview.send = original;
          }
        },
      );
      await t.test(
        'successful login upgrades old Argon2 cost without authenticating an obsolete credential',
        async () => {
          const id = await register('upgrade@example.test');
          const old = await hash(password, {
            type: argon2id,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          });
          await source.query(
            'UPDATE user_credentials SET password_hash=$2 WHERE user_id=$1',
            [id, old],
          );
          await login('upgrade@example.test');
          const rows: { password_hash: string }[] = await source.query(
            'SELECT password_hash FROM user_credentials WHERE user_id=$1',
            [id],
          );
          assert.notEqual(rows[0]?.password_hash, old);
          assert.ok(rows[0]?.password_hash.includes('m=65536'));
        },
      );
      await t.test(
        'login rejects unknown/wrong email identically and me only exposes allowlisted fields',
        async () => {
          const bad = await post('login', {
            email: 'seller@example.test',
            password: 'wrong password value',
          });
          const unknown = await post('login', {
            email: 'unknown@example.test',
            password: 'wrong password value',
          });
          const badBody: Record<string, unknown> = await bad.json();
          const unknownBody: Record<string, unknown> = await unknown.json();
          delete badBody.requestId;
          delete unknownBody.requestId;
          assert.equal(bad.status, 401);
          assert.equal(unknown.status, 401);
          assert.deepEqual(badBody, unknownBody);
          assert.equal(badBody.code, 'INVALID_CREDENTIALS');
          const grant = await login(' SELLER@example.test ');
          const response = await me(grant);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          const profile: Record<string, unknown> = await response.json();
          assert.deepEqual(Object.keys(profile).sort(), [
            'displayName',
            'email',
            'emailVerifiedAt',
            'id',
            'roles',
            'status',
          ]);
          assert.equal(profile.email, 'seller@example.test');
          await code(await me(), 401, 'AUTHENTICATION_REQUIRED');
          await code(
            await me({
              ...grant,
              access: grant.access.slice(0, -8) + 'tampered',
            }),
            401,
            'AUTHENTICATION_REQUIRED',
          );
          const rows: { token_hash: string }[] = await source.query(
            'SELECT token_hash FROM session_tokens WHERE session_id=$1',
            [grant.sid],
          );
          assert.equal(
            rows[0]?.token_hash,
            tokenDigest(
              grant.cookie.slice(grant.cookie.indexOf('=') + 1),
              'REFRESH',
            ),
          );
        },
      );
      await t.test(
        'refresh rotates in one session, retains consumed hashes, picks up roles and rejects other transports',
        async () => {
          const first = await login('seller@example.test');
          await source.query(
            "INSERT INTO user_roles (user_id,role) SELECT id,'MODERATOR' FROM users WHERE email_normalized='seller@example.test'",
          );
          const second = await grantFrom(await post('refresh', {}, first));
          assert.equal(first.sid, second.sid);
          assert.notEqual(first.cookie, second.cookie);
          assert.deepEqual(decodeJwt(second.access).roles, [
            'MODERATOR',
            'USER',
          ]);
          const third = await grantFrom(await post('refresh', {}, second));
          assert.equal(third.sid, first.sid);
          const rows: { total: string; live: string; consumed: string }[] =
            await source.query(
              'SELECT count(*) AS total, count(*) FILTER (WHERE consumed_at IS NULL AND revoked_at IS NULL) AS live, count(*) FILTER (WHERE consumed_at IS NOT NULL) AS consumed FROM session_tokens WHERE session_id=$1',
              [first.sid],
            );
          assert.deepEqual(rows[0], { total: '3', live: '1', consumed: '2' });
          await code(
            await post('refresh', { token: 'not-accepted' }, third),
            400,
            'VALIDATION_ERROR',
          );
          await code(
            await post('refresh?token=bad', {}, third),
            400,
            'VALIDATION_ERROR',
          );
          await code(await post('refresh'), 401, 'INVALID_REFRESH_TOKEN');
        },
      );
      await t.test(
        'replay commits family revocation and audit; replacement access/refresh become invalid',
        async () => {
          const first = await login('seller@example.test');
          const second = await grantFrom(await post('refresh', {}, first));
          await code(
            await post('refresh', {}, first),
            401,
            'REFRESH_TOKEN_REUSED',
          );
          await code(await post('refresh', {}, second), 401, 'SESSION_REVOKED');
          await code(await me(second), 401, 'SESSION_REVOKED');
          const auditRows: { count: string }[] = await source.query(
            "SELECT count(*) FROM audit_logs WHERE action='AUTH_REFRESH_REUSE_DETECTED' AND target_id=$1",
            [first.sid],
          );
          assert.equal(auditRows[0]?.count, '1');
          const live: { count: string }[] = await source.query(
            'SELECT count(*) FROM session_tokens WHERE session_id=$1 AND revoked_at IS NULL',
            [first.sid],
          );
          assert.equal(live[0]?.count, '0');
        },
      );
      await t.test(
        'concurrent refresh cannot create two valid branches',
        async () => {
          const first = await login('seller@example.test');
          const responses = await Promise.all([
            post('refresh', {}, first),
            post('refresh', {}, first),
          ]);
          assert.deepEqual(
            responses.map((response) => response.status).sort(),
            [200, 401],
          );
          const successful = responses.find(
            (response) => response.status === 200,
          );
          const denied = responses.find((response) => response.status === 401);
          assert.ok(successful && denied);
          const winner = await grantFrom(successful);
          await code(denied, 401, 'REFRESH_TOKEN_REUSED');
          await code(await me(winner), 401, 'SESSION_REVOKED');
          const rows: { total: string; live: string }[] = await source.query(
            'SELECT count(*) AS total,count(*) FILTER (WHERE revoked_at IS NULL AND consumed_at IS NULL) AS live FROM session_tokens WHERE session_id=$1',
            [first.sid],
          );
          assert.deepEqual(rows[0], { total: '2', live: '0' });
        },
      );
      await t.test(
        'absolute and idle expiry deny access and refresh, without sliding absolute deadline',
        async () => {
          for (const idle of [false, true]) {
            const grant = await login('seller@example.test');
            if (idle)
              await source.query(
                "UPDATE user_sessions SET created_at=now()-interval '10 days',last_used_at=now()-interval '8 days' WHERE id=$1",
                [grant.sid],
              );
            else
              await source.query(
                "UPDATE user_sessions SET created_at=now()-interval '2 days',last_used_at=now()-interval '1 day',expires_at=now()-interval '1 hour' WHERE id=$1",
                [grant.sid],
              );
            await code(await me(grant), 401, 'SESSION_EXPIRED');
            await code(
              await post('refresh', {}, grant),
              401,
              'SESSION_EXPIRED',
            );
          }
          const grant = await login('seller@example.test');
          const before = await source.query(
            'SELECT expires_at FROM user_sessions WHERE id=$1',
            [grant.sid],
          );
          await post('refresh', {}, grant);
          const after = await source.query(
            'SELECT expires_at FROM user_sessions WHERE id=$1',
            [grant.sid],
          );
          assert.deepEqual(before, after);
        },
      );
      await t.test(
        'logout is idempotent and logout-all immediately revokes every device',
        async () => {
          const grant = await login('seller@example.test');
          const response = await post('logout', {}, grant);
          assert.equal(response.status, 204);
          assert.match(
            response.headers.get('set-cookie') ?? '',
            /Expires=Thu, 01 Jan 1970/,
          );
          assert.equal((await post('logout', {}, grant)).status, 204);
          await code(await me(grant), 401, 'SESSION_REVOKED');
          const first = await login('seller@example.test');
          const second = await login('seller@example.test');
          assert.equal((await post('logout-all', {}, first)).status, 204);
          await code(await me(first), 401, 'SESSION_REVOKED');
          await code(await me(second), 401, 'SESSION_REVOKED');
          await code(await post('refresh', {}, second), 401, 'SESSION_REVOKED');
        },
      );
      await t.test(
        'blocked/suspended accounts cannot login or use existing access/refresh',
        async () => {
          const id = await register('status@example.test');
          for (const status of ['BLOCKED', 'SUSPENDED']) {
            await source.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [
              id,
            ]);
            const grant = await login('status@example.test');
            await source.query('UPDATE users SET status=$2 WHERE id=$1', [
              id,
              status,
            ]);
            const expected = `ACCOUNT_${status}`;
            await code(
              await post('login', { email: 'status@example.test', password }),
              403,
              expected,
            );
            await code(await me(grant), 403, expected);
            await code(await post('refresh', {}, grant), 403, expected);
            await code(
              await post('login', {
                email: 'status@example.test',
                password: 'wrong password value',
              }),
              401,
              'INVALID_CREDENTIALS',
            );
          }
        },
      );
      await t.test(
        'RBAC allows multiple roles, rejects elevated access and reflects role removal immediately',
        async () => {
          const grant = await login('seller@example.test');
          const get = (path: string) =>
            fetch(`${origin}/api/v1/auth-test/${path}`, {
              headers: { authorization: `Bearer ${grant.access}` },
            });
          assert.equal((await get('user')).status, 200);
          assert.equal((await get('moderator')).status, 200);
          await code(await get('admin'), 403, 'FORBIDDEN');
          await source.query(
            "DELETE FROM user_roles WHERE user_id=(SELECT id FROM users WHERE email_normalized='seller@example.test') AND role='MODERATOR'",
          );
          await code(await get('moderator'), 403, 'FORBIDDEN');
          await source.query(
            "INSERT INTO user_roles(user_id,role) SELECT id,'ADMIN' FROM users WHERE email_normalized='seller@example.test'",
          );
          assert.equal((await get('admin')).status, 200);
          await code(await get('moderator'), 403, 'FORBIDDEN');
        },
      );
      await t.test(
        'verification expiry and purpose isolation reject invalid links',
        async () => {
          await register('expired@example.test', false); // Register helper consumed only preview, not the persisted token.
          await post('email-verification/request', {
            email: 'expired@example.test',
          });
          const token = actionToken(
            'expired@example.test',
            'EMAIL_VERIFICATION',
          );
          await source.query(
            "UPDATE auth_action_tokens SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE token_hash=$1",
            [tokenDigest(token, 'EMAIL_VERIFICATION')],
          );
          await code(
            await post('email-verification/confirm', { token }),
            400,
            'VERIFICATION_TOKEN_EXPIRED',
          );
          await post('password/forgot', { email: 'seller@example.test' });
          const reset = actionToken('seller@example.test', 'PASSWORD_RESET');
          await code(
            await post('email-verification/confirm', { token: reset }),
            400,
            'INVALID_VERIFICATION_TOKEN',
          );
        },
      );
      await t.test(
        'recovery is generic, stores only digest, resets password and revokes sessions; replay fails',
        async () => {
          const first = await login('seller@example.test');
          const second = await login('seller@example.test');
          const known = await post('password/forgot', {
            email: 'seller@example.test',
          });
          const unknown = await post('password/forgot', {
            email: 'missing@example.test',
          });
          assert.equal(known.status, 202);
          assert.equal(unknown.status, 202);
          assert.deepEqual(await known.json(), await unknown.json());
          const token = actionToken('seller@example.test', 'PASSWORD_RESET');
          const rows: { token_hash: string }[] = await source.query(
            'SELECT token_hash FROM auth_action_tokens WHERE token_hash=$1',
            [tokenDigest(token, 'PASSWORD_RESET')],
          );
          assert.equal(rows.length, 1);
          assert.notEqual(rows[0]?.token_hash, token);
          assert.equal(
            (await post('password/reset', { token, newPassword })).status,
            204,
          );
          await code(await me(first), 401, 'SESSION_REVOKED');
          await code(await post('refresh', {}, second), 401, 'SESSION_REVOKED');
          await code(
            await post('login', { email: 'seller@example.test', password }),
            401,
            'INVALID_CREDENTIALS',
          );
          await login('seller@example.test', newPassword);
          await code(
            await post('password/reset', { token, newPassword: password }),
            400,
            'INVALID_PASSWORD_RESET_TOKEN',
          );
          await post('password/forgot', { email: 'seller@example.test' });
          const expired = actionToken('seller@example.test', 'PASSWORD_RESET');
          await source.query(
            "UPDATE auth_action_tokens SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE token_hash=$1",
            [tokenDigest(expired, 'PASSWORD_RESET')],
          );
          await code(
            await post('password/reset', {
              token: expired,
              newPassword: password,
            }),
            400,
            'PASSWORD_RESET_TOKEN_EXPIRED',
          );
        },
      );
      await t.test(
        'password change requires current password, rejects equality and revokes other devices/reset links',
        async () => {
          const first = await login('seller@example.test', newPassword);
          const other = await login('seller@example.test', newPassword);
          await code(
            await post(
              'password/change',
              {
                currentPassword: 'not the right password',
                newPassword: password,
              },
              first,
            ),
            400,
            'INVALID_CURRENT_PASSWORD',
          );
          await code(
            await post(
              'password/change',
              { currentPassword: newPassword, newPassword },
              first,
            ),
            400,
            'PASSWORD_UNCHANGED',
          );
          await post('password/forgot', { email: 'seller@example.test' });
          const reset = actionToken('seller@example.test', 'PASSWORD_RESET');
          assert.equal(
            (
              await post(
                'password/change',
                { currentPassword: newPassword, newPassword: password },
                first,
              )
            ).status,
            204,
          );
          assert.equal((await me(first)).status, 200);
          await grantFrom(await post('refresh', {}, first));
          await code(await me(other), 401, 'SESSION_REVOKED');
          await code(
            await post('password/reset', { token: reset, newPassword }),
            400,
            'INVALID_PASSWORD_RESET_TOKEN',
          );
          await code(
            await post('login', {
              email: 'seller@example.test',
              password: newPassword,
            }),
            401,
            'INVALID_CREDENTIALS',
          );
          await login('seller@example.test');
        },
      );
      await t.test(
        'simultaneous recovery confirmation consumes a token once and leaves no live old sessions',
        async () => {
          const id = await register('reset-race@example.test');
          const grant = await login('reset-race@example.test');
          await post('password/forgot', { email: 'reset-race@example.test' });
          const token = actionToken(
            'reset-race@example.test',
            'PASSWORD_RESET',
          );
          const responses = await Promise.all([
            post('password/reset', { token, newPassword }),
            post('password/reset', { token, newPassword }),
          ]);
          assert.deepEqual(
            responses.map((response) => response.status).sort(),
            [204, 400],
          );
          await code(await me(grant), 401, 'SESSION_REVOKED');
          await login('reset-race@example.test', newPassword);
          const rows: { count: string }[] = await source.query(
            "SELECT count(*) FROM audit_logs WHERE action='AUTH_PASSWORD_RESET_COMPLETED' AND target_id=$1",
            [id],
          );
          assert.equal(rows[0]?.count, '1');
        },
      );
      await t.test(
        'CSRF rejects missing/foreign Origin and cross-site requests; exact CORS credentials are controlled',
        async () => {
          const grant = await login('seller@example.test');
          const invalidOrigins: Record<string, string>[] = [
            { origin: '' },
            { origin: 'https://evil.example.test' },
            { 'sec-fetch-site': 'cross-site' },
          ];
          for (const headers of invalidOrigins) {
            await code(
              await post('refresh', {}, grant, headers),
              403,
              'ORIGIN_NOT_ALLOWED',
            );
            await code(
              await post('logout', {}, grant, headers),
              403,
              'ORIGIN_NOT_ALLOWED',
            );
          }
          assert.equal((await me(grant)).status, 200);
          const allowed = await post('refresh', {}, grant);
          assert.equal(
            allowed.headers.get('access-control-allow-origin'),
            config.webUrl,
          );
          assert.equal(
            allowed.headers.get('access-control-allow-credentials'),
            'true',
          );
          await grantFrom(allowed);
          const foreign = await post(
            'login',
            { email: 'seller@example.test', password },
            undefined,
            { origin: 'https://evil.example.test' },
          );
          assert.notEqual(
            foreign.headers.get('access-control-allow-origin'),
            'https://evil.example.test',
          );
          assert.equal(foreign.status, 403);
        },
      );
      await t.test(
        'real Redis atomically bounds endpoint/account attempts with Retry-After and expiration',
        async () => {
          realRate = true;
          const email = `rate-${randomUUID()}@example.test`;
          for (let i = 0; i < 3; i++)
            assert.equal(
              (await post('password/forgot', { email })).status,
              202,
            );
          const response = await post('password/forgot', {
            email: email.toUpperCase(),
          });
          await code(response, 429, 'AUTH_RATE_LIMITED');
          assert.ok(Number(response.headers.get('retry-after')) > 0);
          const key = limiter.key('refresh', 'identity', randomUUID());
          const concurrent = await Promise.all(
            Array.from({ length: 8 }, () => redis.consumeLimits([key], [3], 1)),
          );
          assert.equal(concurrent.filter((value) => value === 0).length, 3);
          assert.equal(concurrent.filter((value) => value > 0).length, 5);
          // Redis TTL rounds to zero before actual expiration; that must still deny.
          await new Promise((resolve) => setTimeout(resolve, 650));
          assert.ok((await redis.consumeLimits([key], [3], 1)) > 0);
          await new Promise((resolve) => setTimeout(resolve, 1100));
          assert.equal(await redis.consumeLimits([key], [3], 1), 0);
          realRate = false;
        },
      );
      await t.test(
        'Redis limiter outage returns safe 503 while existing Bearer reads still work',
        async () => {
          const grant = await login('seller@example.test');
          const original = redis.consumeLimits.bind(redis);
          realRate = true;
          redis.consumeLimits = async () => {
            throw new Error('private redis password must not leak');
          };
          try {
            await code(
              await post('login', { email: 'seller@example.test', password }),
              503,
              'AUTH_RATE_LIMIT_UNAVAILABLE',
            );
            assert.equal((await me(grant)).status, 200);
          } finally {
            redis.consumeLimits = original;
            realRate = false;
          }
        },
      );
      await t.test(
        'cleanup bounds deletion, preserves live family history and cascades expired refresh tokens',
        async () => {
          const grant = await login('seller@example.test');
          const persistence = app.get(AuthPersistence);
          await source.query(
            "UPDATE user_sessions SET created_at=now()-interval '5 days',last_used_at=now()-interval '4 days',expires_at=now()-interval '3 days' WHERE id=$1",
            [grant.sid],
          );
          const result = await app.get(SessionService).cleanup(1);
          assert.equal(result.sessions, 1);
          const rows: { count: string }[] = await source.query(
            'SELECT count(*) FROM session_tokens WHERE session_id=$1',
            [grant.sid],
          );
          assert.equal(rows[0]?.count, '0');
          await assert.rejects(
            () => persistence.cleanup(new Date(), 1001),
            RangeError,
          );
        },
      );
      await t.test(
        'all expected security events exist and logs/audit/DTO contain no passwords or credentials',
        async () => {
          const rows: { action: string; payload: string }[] =
            await source.query(
              'SELECT action,row_to_json(audit_logs)::text AS payload FROM audit_logs',
            );
          for (const action of [
            'AUTH_REGISTERED',
            'AUTH_LOGIN_SUCCEEDED',
            'AUTH_LOGIN_FAILED',
            'AUTH_SESSION_REFRESHED',
            'AUTH_REFRESH_REUSE_DETECTED',
            'AUTH_LOGGED_OUT',
            'AUTH_LOGGED_OUT_ALL',
            'AUTH_EMAIL_VERIFIED',
            'AUTH_PASSWORD_RESET_REQUESTED',
            'AUTH_PASSWORD_RESET_COMPLETED',
            'AUTH_PASSWORD_CHANGED',
          ])
            assert.ok(
              rows.some((row) => row.action === action),
              action,
            );
          const logs = logger.events.join('\n');
          const audits = rows.map((row) => row.payload).join('\n');
          for (const secret of secrets) {
            assert.equal(logs.includes(secret), false);
            assert.equal(audits.includes(secret), false);
          }
          const hasher = app.get(PasswordHasher);
          assert.equal(await hasher.verify(null, password), false);
        },
      );
      await t.test(
        'OpenAPI contains every auth route, security schemes and allowlisted response schemas',
        async () => {
          const response = await fetch(`${origin}/api/docs-json`);
          assert.equal(response.status, 200);
          const document: {
            paths: Record<string, unknown>;
            components: {
              securitySchemes: Record<string, unknown>;
              schemas: Record<string, { properties: Record<string, unknown> }>;
            };
          } = await response.json();
          for (const path of [
            'register',
            'login',
            'refresh',
            'logout',
            'logout-all',
            'me',
            'email-verification/request',
            'email-verification/confirm',
            'password/forgot',
            'password/reset',
            'password/change',
          ])
            assert.ok(document.paths[`/api/v1/auth/${path}`], path);
          assert.ok(document.components.securitySchemes.bearer);
          assert.equal(
            'passwordHash' in
              (document.components.schemas.CurrentUserResponse?.properties ??
                {}),
            false,
          );
        },
      );
    } finally {
      await app.close();
      await database.close();
    }
  },
);
