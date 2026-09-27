import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignJWT, decodeJwt } from 'jose';
import { hash, argon2id } from 'argon2';
import { parseConfig } from '../../src/config/config';
import { testEnvironment } from '../fixtures';
import { ApiException } from '../../src/platform/http/api-error';
import { validateNewPassword } from '../../src/modules/auth/domain/password-policy';
import {
  hasRequiredRole,
  sessionFailure,
} from '../../src/modules/auth/domain/auth.types';
import {
  AuthTokens,
  newSecret,
  tokenDigest,
  validSecret,
} from '../../src/modules/auth/infrastructure/crypto/auth-tokens';
import { PasswordHasher } from '../../src/modules/auth/infrastructure/crypto/password-hasher';
import {
  cookieOptions,
  readRefreshCookie,
} from '../../src/modules/auth/http/refresh-cookie';
import {
  AuthRateLimiter,
  AUTH_RATE_POLICIES,
} from '../../src/modules/auth/http/auth-rate.guard';
import { RedisConnection } from '../../src/platform/redis/redis.connection';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import type { Request } from 'express';

const config = parseConfig(testEnvironment());
test('password policy counts Unicode code points, preserves whitespace and bounds expensive input', () => {
  for (const password of [
    'a'.repeat(15),
    'a'.repeat(128),
    '😀'.repeat(15),
    ' spaces count too ',
  ])
    validateNewPassword(password);
  for (const password of [
    'a'.repeat(14),
    'a'.repeat(129),
    '😀'.repeat(129),
    'x'.repeat(100000),
  ])
    assert.throws(
      () => validateNewPassword(password),
      (error: unknown) =>
        error instanceof ApiException &&
        error.code === 'PASSWORD_POLICY_VIOLATION',
    );
});
test('Argon2id uses independent salts, detects wrong/unknown passwords and supports cost upgrades', async () => {
  const hasher = new PasswordHasher();
  const password = 'a sufficiently long passphrase';
  const first = await hasher.hash(password);
  const second = await hasher.hash(password);
  assert.notEqual(first, second);
  assert.match(first, /^\$argon2id\$v=19\$/);
  assert.deepEqual(first.split('$')[3]?.split(',').sort(), [
    'm=65536',
    'p=1',
    't=3',
  ]);
  assert.equal(await hasher.verify(first, password), true);
  assert.equal(await hasher.verify(first, password + ' '), false);
  assert.equal(await hasher.verify(null, password), false);
  assert.equal(hasher.needsRehash(first), false);
  const old = await hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  assert.equal(hasher.needsRehash(old), true);
});
test('high entropy action credentials have purpose-separated fixed digests and no identity', () => {
  const secret = newSecret();
  assert.equal(validSecret(secret), true);
  assert.notEqual(secret, newSecret());
  assert.match(tokenDigest(secret, 'REFRESH'), /^[a-f0-9]{64}$/);
  assert.notEqual(
    tokenDigest(secret, 'EMAIL_VERIFICATION'),
    tokenDigest(secret, 'PASSWORD_RESET'),
  );
  for (const invalid of [
    '',
    'a'.repeat(42),
    'a'.repeat(44),
    'a'.repeat(42) + '=',
  ])
    assert.equal(validSecret(invalid), false);
});
test('JWT verification rejects tampering, expiry, algorithm, issuer, audience, key and malformed principal', async () => {
  const tokens = new AuthTokens(config);
  const principal = {
    userId: randomUUID(),
    sessionId: randomUUID(),
    roles: ['USER' as const, 'MODERATOR' as const],
  };
  const token = await tokens.issue(principal);
  assert.deepEqual(await tokens.verify(token), principal);
  const claims = decodeJwt(token);
  assert.equal(Number(claims.exp) - Number(claims.iat), 600);
  assert.equal('email' in claims, false);
  await assert.rejects(
    () => tokens.verify(token.slice(0, -8) + 'tampered'),
    ApiException,
  );
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    { alg: 'HS384' },
    { kid: 'unknown' },
    { issuer: 'attacker' },
    { audience: 'other-client' },
    { iat: now - 700, exp: now - 100 },
    { iat: now, exp: now + 86400 },
    { sub: 'not-a-uuid' },
    { roles: ['SUPERUSER'] },
  ];
  for (const change of cases) {
    const candidate = await new SignJWT({
      sid: principal.sessionId,
      roles: 'roles' in change ? change.roles : principal.roles,
    })
      .setProtectedHeader({
        alg: change.alg ?? 'HS256',
        typ: 'at+jwt',
        kid: change.kid ?? config.auth.accessKeyId,
      })
      .setSubject(change.sub ?? principal.userId)
      .setIssuer(change.issuer ?? 'vehicle-marketplace')
      .setAudience(change.audience ?? 'marketplace-web')
      .setIssuedAt(change.iat ?? now)
      .setExpirationTime(change.exp ?? now + 600)
      .sign(Buffer.from(config.auth.accessSecret, 'hex'));
    await assert.rejects(() => tokens.verify(candidate), ApiException);
  }
  const rotated = new AuthTokens({
    ...config,
    auth: {
      ...config.auth,
      accessSecret: 'ab'.repeat(32),
      accessKeyId: 'new',
      previousAccessSecret: config.auth.accessSecret,
      previousAccessKeyId: config.auth.accessKeyId,
    },
  });
  assert.deepEqual(await rotated.verify(token), principal);
  const newToken = await rotated.issue(principal);
  await assert.rejects(() => tokens.verify(newToken), ApiException);
});
test('revocation, absolute and idle deadlines take effect at the boundary; roles have any-of semantics', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  const session = {
    createdAt: new Date(now.getTime() - 100000),
    lastUsedAt: new Date(now.getTime() - 10000),
    expiresAt: new Date(now.getTime() + 1000),
    revokedAt: null,
  };
  assert.equal(sessionFailure(session, 11, now), null);
  assert.equal(sessionFailure(session, 10, now), 'SESSION_EXPIRED');
  assert.equal(
    sessionFailure({ ...session, expiresAt: now }, 11, now),
    'SESSION_EXPIRED',
  );
  assert.equal(
    sessionFailure({ ...session, revokedAt: now }, 11, now),
    'SESSION_REVOKED',
  );
  assert.equal(hasRequiredRole(['USER', 'MODERATOR'], ['MODERATOR']), true);
  assert.equal(hasRequiredRole(['USER', 'MODERATOR'], ['ADMIN']), false);
  assert.equal(hasRequiredRole(['ADMIN'], ['MODERATOR']), false);
});
test('cookie is host-only, HttpOnly, scoped and Secure for production; duplicate cookie is rejected', () => {
  assert.deepEqual(cookieOptions({ ...config.auth, cookieSecure: true }), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/api/v1/auth',
  });
  const req = {
    headers: {
      cookie: `marketplace_refresh=${newSecret()}; marketplace_refresh=${newSecret()}`,
    },
  };
  assert.throws(() => readRefreshCookie(req as Request), ApiException);
});
test('Redis rate keys hide raw identifiers, policies differ and store failure fails closed', async () => {
  const redis = new RedisConnection(config, new StructuredLogger(config));
  redis.consumeLimits = async () => {
    throw new Error('store down');
  };
  const limiter = new AuthRateLimiter(config, redis);
  assert.equal(
    limiter.key('login', 'identity', 'seller@example.test').includes('seller'),
    false,
  );
  assert.equal(
    limiter.key('login', 'ip', '192.0.2.123').includes('192.0.2'),
    false,
  );
  assert.notEqual(
    limiter.key('login', 'identity', 'x'),
    limiter.key('forgot', 'identity', 'x'),
  );
  assert.notEqual(
    AUTH_RATE_POLICIES.login.window,
    AUTH_RATE_POLICIES.refresh.window,
  );
  await assert.rejects(
    () => limiter.consume('login', '127.0.0.1', 'account'),
    (error: unknown) =>
      error instanceof ApiException &&
      error.code === 'AUTH_RATE_LIMIT_UNAVAILABLE',
  );
});
