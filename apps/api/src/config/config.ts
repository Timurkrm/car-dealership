import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseAuthConfig } from './auth-config';
import type { AuthConfig } from './auth-config';
import { parseMediaConfig } from './media-config';
import type { MediaConfig } from './media-config';
import { parseEmailDeliveryConfig } from './email-delivery-config';
import type { EmailDeliveryConfig } from './email-delivery-config';

export const APP_CONFIG = Symbol('APP_CONFIG');
export type Environment = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface AppConfig {
  environment: Environment;
  port: number;
  webUrl: string;
  swagger: boolean;
  logLevel: LogLevel;
  runtime: {
    shutdownTimeoutMs: number;
    slowRequestMs: number;
    slowJobMs: number;
    trustProxyHops: number;
  };
  auth: AuthConfig;
  media: MediaConfig;
  emailDelivery: EmailDeliveryConfig;
  engagement: {
    savedSearchMaxPerUser: number;
    outboxBatchSize: number;
    outboxLeaseSeconds: number;
    outboxMaxAttempts: number;
  };
  messaging: {
    maxBodyCodePoints: number;
    socketRevalidateSeconds: number;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    poolMax: number;
    connectionTimeoutMs: number;
    idleTimeoutMs: number;
    statementTimeoutMs: number;
    lockTimeoutMs: number;
    idleTransactionTimeoutMs: number;
  };
  redis: { host: string; port: number; password: string; tls: boolean };
  storage: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
  retention: {
    authTokenDays: number;
    outboxProcessedDays: number;
    deliverySentDays: number;
    cleanupBatchSize: number;
    cleanupMaxRows: number;
  };
}
export class ConfigurationError extends Error {}

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const issues: string[] = [];
  const required = (key: string): string => {
    const value = env[key];
    if (
      !value ||
      value.trim().length === 0 ||
      value.startsWith('replace-with-')
    )
      issues.push(`${key} is required (replace placeholders)`);
    return value ?? '';
  };
  const port = (key: string): number => {
    const value = required(key);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
      issues.push(`${key} must be a port between 1 and 65535`);
    return Number(value);
  };
  const boolean = (key: string, fallback: boolean): boolean => {
    const value = env[key];
    if (value === undefined) return fallback;
    if (value !== 'true' && value !== 'false')
      issues.push(`${key} must be true or false`);
    return value === 'true';
  };
  const boundedInteger = (
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number => {
    const value = env[key];
    if (value === undefined) return fallback;
    if (
      !/^\d+$/.test(value) ||
      Number(value) < minimum ||
      Number(value) > maximum
    )
      issues.push(
        `${key} must be an integer between ${minimum} and ${maximum}`,
      );
    return Number(value);
  };
  const url = (key: string, optional = false): string | undefined => {
    if (optional && !env[key]) return undefined;
    const value = required(key);
    try {
      const parsed = new URL(value);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        (key === 'WEB_URL' && parsed.pathname !== '/')
      )
        throw new Error();
      if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
        issues.push(`${key} must use HTTPS in production`);
    } catch {
      issues.push(
        `${key} must be an HTTP(S) URL without credentials, query or fragment`,
      );
    }
    return value.replace(/\/$/, '');
  };
  const environment = required('NODE_ENV');
  if (!['development', 'test', 'production'].includes(environment))
    issues.push('NODE_ENV must be development, test or production');
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel))
    issues.push('LOG_LEVEL must be debug, info, warn or error');
  const name = required('DATABASE_NAME');
  if (environment === 'test' && !name.endsWith('_test'))
    issues.push('Test DATABASE_NAME must end in _test');
  const config: AppConfig = {
    environment: environment as Environment,
    port: port('API_PORT'),
    webUrl: url('WEB_URL') ?? '',
    logLevel: logLevel as LogLevel,
    swagger: boolean('SWAGGER_ENABLED', environment === 'development'),
    runtime: {
      shutdownTimeoutMs: boundedInteger(
        'SHUTDOWN_TIMEOUT_MS',
        20_000,
        5_000,
        60_000,
      ),
      slowRequestMs: boundedInteger('SLOW_REQUEST_MS', 2_000, 100, 60_000),
      slowJobMs: boundedInteger('SLOW_JOB_MS', 10_000, 500, 300_000),
      trustProxyHops: boundedInteger('TRUST_PROXY_HOPS', 0, 0, 3),
    },
    auth: parseAuthConfig(env, issues),
    media: parseMediaConfig(env, issues),
    emailDelivery: parseEmailDeliveryConfig(env, issues),
    engagement: {
      savedSearchMaxPerUser: boundedInteger(
        'SAVED_SEARCH_MAX_PER_USER',
        50,
        1,
        200,
      ),
      outboxBatchSize: boundedInteger('OUTBOX_BATCH_SIZE', 50, 1, 200),
      outboxLeaseSeconds: boundedInteger('OUTBOX_LEASE_SECONDS', 120, 30, 3600),
      outboxMaxAttempts: boundedInteger('OUTBOX_MAX_ATTEMPTS', 8, 1, 25),
    },
    messaging: {
      maxBodyCodePoints: boundedInteger(
        'MESSAGING_MAX_BODY_CODE_POINTS',
        8000,
        100,
        8000,
      ),
      socketRevalidateSeconds: boundedInteger(
        'REALTIME_REVALIDATE_SECONDS',
        60,
        10,
        300,
      ),
    },
    database: {
      host: required('DATABASE_HOST'),
      port: port('DATABASE_PORT'),
      name,
      user: required('DATABASE_USER'),
      password: required('DATABASE_PASSWORD'),
      ssl: boolean('DATABASE_SSL', environment === 'production'),
      poolMax: boundedInteger('DATABASE_POOL_MAX', 10, 1, 50),
      connectionTimeoutMs: boundedInteger(
        'DATABASE_CONNECTION_TIMEOUT_MS',
        3_000,
        500,
        30_000,
      ),
      idleTimeoutMs: boundedInteger(
        'DATABASE_IDLE_TIMEOUT_MS',
        30_000,
        1_000,
        300_000,
      ),
      statementTimeoutMs: boundedInteger(
        'DATABASE_STATEMENT_TIMEOUT_MS',
        15_000,
        500,
        120_000,
      ),
      lockTimeoutMs: boundedInteger(
        'DATABASE_LOCK_TIMEOUT_MS',
        2_000,
        100,
        30_000,
      ),
      idleTransactionTimeoutMs: boundedInteger(
        'DATABASE_IDLE_TRANSACTION_TIMEOUT_MS',
        10_000,
        1_000,
        120_000,
      ),
    },
    redis: {
      host: required('REDIS_HOST'),
      port: port('REDIS_PORT'),
      password: required('REDIS_PASSWORD'),
      tls: boolean('REDIS_TLS', environment === 'production'),
    },
    storage: {
      endpoint: url('S3_ENDPOINT', true),
      region: required('S3_REGION'),
      bucket: required('S3_BUCKET'),
      accessKey: required('S3_ACCESS_KEY'),
      secretKey: required('S3_SECRET_KEY'),
      forcePathStyle: boolean('S3_FORCE_PATH_STYLE', false),
    },
    retention: {
      authTokenDays: boundedInteger('AUTH_TOKEN_RETENTION_DAYS', 30, 1, 3650),
      outboxProcessedDays: boundedInteger(
        'OUTBOX_PROCESSED_RETENTION_DAYS',
        60,
        7,
        3650,
      ),
      deliverySentDays: boundedInteger(
        'DELIVERY_SENT_RETENTION_DAYS',
        60,
        7,
        3650,
      ),
      cleanupBatchSize: boundedInteger('CLEANUP_BATCH_SIZE', 500, 1, 5_000),
      cleanupMaxRows: boundedInteger(
        'CLEANUP_MAX_ROWS_PER_RUN',
        5_000,
        1,
        50_000,
      ),
    },
  };
  if (config.retention.cleanupBatchSize > config.retention.cleanupMaxRows)
    issues.push('CLEANUP_BATCH_SIZE must not exceed CLEANUP_MAX_ROWS_PER_RUN');
  if (environment === 'production') {
    if (!config.database.ssl)
      issues.push('DATABASE_SSL must be true in production');
    if (!config.redis.tls) issues.push('REDIS_TLS must be true in production');
    if (config.database.password.length < 16)
      issues.push('DATABASE_PASSWORD is too short for production');
    if (config.redis.password.length < 32)
      issues.push('REDIS_PASSWORD is too short for production');
    if (
      config.storage.accessKey.length < 8 ||
      config.storage.secretKey.length < 32 ||
      /^(minioadmin|changeme)$/i.test(config.storage.accessKey) ||
      /^(minioadmin|changeme)$/i.test(config.storage.secretKey)
    )
      issues.push('S3 credentials are weak or development-only');
  }
  if (issues.length)
    throw new ConfigurationError(`Invalid configuration: ${issues.join('; ')}`);
  return config;
}

export function workspaceRoot(): string {
  let current = process.cwd();
  while (current !== parse(current).root) {
    if (existsSync(join(current, 'compose.yaml'))) return current;
    current = dirname(current);
  }
  throw new ConfigurationError('Cannot locate workspace root (compose.yaml)');
}

export function loadConfig(environment?: Environment): AppConfig {
  if (environment) process.env.NODE_ENV = environment;
  const file = join(
    workspaceRoot(),
    process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  );
  if (existsSync(file)) loadEnvFile(file);
  return parseConfig(process.env);
}
