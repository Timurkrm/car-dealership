import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ConfigurationError, parseConfig } from '../../src/config/config';
import { testEnvironment } from '../fixtures';
import { databaseOptions } from '../../src/platform/database/database-options';

test('configuration is typed and migrations never synchronize automatically', () => {
  const config = parseConfig(testEnvironment());
  assert.equal(config.port, 4100);
  assert.equal(config.swagger, false);
  assert.equal(config.runtime.trustProxyHops, 0);
  assert.equal(config.database.poolMax, 10);
  assert.equal(config.database.statementTimeoutMs, 15000);
  assert.equal(config.retention.cleanupMaxRows, 5000);
  assert.equal(databaseOptions(config).synchronize, false);
  assert.equal(databaseOptions(config).migrationsRun, false);
});
test('invalid configuration fails without exposing supplied secrets', () => {
  const env = {
    ...testEnvironment(),
    DATABASE_PORT: 'secret-invalid-value',
    REDIS_PASSWORD: undefined,
  };
  assert.throws(
    () => parseConfig(env),
    (error: unknown) =>
      error instanceof ConfigurationError &&
      error.message.includes('DATABASE_PORT') &&
      error.message.includes('REDIS_PASSWORD') &&
      !error.message.includes('secret-invalid-value'),
  );
});
test('test environment refuses the development database', () => {
  assert.throws(
    () => parseConfig({ ...testEnvironment(), DATABASE_NAME: 'marketplace' }),
    /must end in _test/,
  );
});
test('rejects wildcard CORS, URL credentials, invalid boolean and out-of-range port', () => {
  for (const values of [
    { WEB_URL: '*' },
    { WEB_URL: 'https://user:password@example.com' },
    { DATABASE_SSL: 'yes' },
    { API_PORT: '65536' },
    { TRUST_PROXY_HOPS: '4' },
    { CLEANUP_BATCH_SIZE: '501', CLEANUP_MAX_ROWS_PER_RUN: '500' },
    { DATABASE_PASSWORD: 'replace-with-generated-local-password' },
  ])
    assert.throws(
      () => parseConfig({ ...testEnvironment(), ...values }),
      ConfigurationError,
    );
});
test('production defaults to verified TLS and disables Swagger', () => {
  const env = {
    ...testEnvironment(),
    NODE_ENV: 'production',
    AUTH_EMAIL_MODE: 'http',
    AUTH_EMAIL_DELIVERY_URL: 'https://email.example.test/send',
    AUTH_EMAIL_DELIVERY_KEY: 'synthetic-email-delivery-key-for-unit-tests',
    EMAIL_FROM_ADDRESS: 'no-reply@example.com',
    EMAIL_FROM_NAME: 'Marketplace',
    WEB_URL: 'https://example.com',
    DATABASE_NAME: 'marketplace',
    DATABASE_SSL: undefined,
    REDIS_TLS: undefined,
    REDIS_PASSWORD: 'synthetic-production-redis-password-32',
    SWAGGER_ENABLED: undefined,
    S3_ENDPOINT: undefined,
    S3_SECRET_KEY: 'synthetic-production-storage-secret-key',
  };
  const config = parseConfig(env);
  assert.equal(config.swagger, false);
  assert.equal(config.database.ssl, true);
  assert.equal(config.redis.tls, true);
});
test('auth rejects weak/missing signing, excessive lifetimes, insecure production cookies and preview delivery', () => {
  for (const values of [
    { AUTH_ACCESS_TOKEN_SECRET: undefined },
    { AUTH_ACCESS_TOKEN_SECRET: 'short' },
    { AUTH_ACCESS_TOKEN_TTL: '3600' },
    { AUTH_REFRESH_IDLE_TTL: '99999999' },
    { AUTH_COOKIE_SAME_SITE: 'none' },
    { AUTH_PREVIOUS_ACCESS_KEY_ID: 'old' },
  ])
    assert.throws(
      () => parseConfig({ ...testEnvironment(), ...values }),
      ConfigurationError,
    );
  const production = {
    ...testEnvironment(),
    NODE_ENV: 'production',
    WEB_URL: 'https://example.test',
    S3_ENDPOINT: undefined,
  };
  assert.throws(
    () => parseConfig({ ...production, AUTH_COOKIE_SECURE: 'false' }),
    /AUTH_COOKIE_SECURE/,
  );
  assert.throws(
    () => parseConfig(production),
    /Production requires AUTH_EMAIL_MODE/,
  );
  assert.throws(
    () =>
      parseConfig({ ...production, AUTH_ACCESS_TOKEN_SECRET: 'a'.repeat(64) }),
    /strong 32-byte/,
  );
});
