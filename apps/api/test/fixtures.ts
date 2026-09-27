import { parseConfig } from '../src/config/config';

export function testEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    API_PORT: '4100',
    WEB_URL: 'http://localhost:3100',
    DATABASE_HOST: '127.0.0.1',
    DATABASE_PORT: '55432',
    DATABASE_NAME: 'marketplace_test',
    DATABASE_USER: 'test-user',
    DATABASE_PASSWORD: 'synthetic-test-password',
    DATABASE_SSL: 'false',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: '56379',
    REDIS_PASSWORD: 'synthetic-redis-password',
    REDIS_TLS: 'false',
    S3_ENDPOINT: 'http://127.0.0.1:59000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'vehicle-media-test',
    S3_ACCESS_KEY: 'synthetic-test-key',
    S3_SECRET_KEY: 'synthetic-test-secret',
    LOG_LEVEL: 'error',
    SWAGGER_ENABLED: 'false',
    AUTH_ACCESS_TOKEN_SECRET: '0123456789abcdef'.repeat(4),
    AUTH_EMAIL_MODE: 'preview',
  };
}
export function testConfig() {
  return parseConfig(testEnvironment());
}
