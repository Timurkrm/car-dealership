import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Body, Controller, Get, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString, MaxLength } from 'class-validator';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { DatabaseConnection } from '../../src/platform/database/database.connection';
import { RedisConnection } from '../../src/platform/redis/redis.connection';
import { ObjectStorage } from '../../src/platform/storage/object-storage';
import { testConfig } from '../fixtures';

class ExampleInput {
  @IsString() @MaxLength(10) name!: string;
}
@Controller({ path: 'test-only', version: '1' })
class TestController {
  @Post() validate(@Body() input: ExampleInput) {
    return input;
  }
  @Get('error') error() {
    throw new Error('SELECT secret-password FROM private_table /internal/path');
  }
}
let app: INestApplication;
let origin: string;
let databaseDown = false;
let redisDown = false;
before(async () => {
  const config = { ...testConfig(), swagger: true };
  const module = await Test.createTestingModule({
    imports: [AppModule.register(config)],
    controllers: [TestController],
  })
    .overrideProvider(DatabaseConnection)
    .useValue({
      check: async () => {
        if (databaseDown) throw new Error('private connection data');
      },
    })
    .overrideProvider(RedisConnection)
    .useValue({
      check: async () => {
        if (redisDown) throw new Error('private connection data');
      },
    })
    .overrideProvider(ObjectStorage)
    .useValue({})
    .compile();
  app = module.createNestApplication({ bodyParser: false, logger: false });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
});
after(async () => {
  if (app) await app.close();
});

test('versioned liveness returns the request ID and security headers', async () => {
  const response = await fetch(`${origin}/api/v1/health`, {
    headers: { 'x-request-id': 'request_123456' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('x-request-id'), 'request_123456');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.ok(
    response.headers
      .get('content-security-policy')
      ?.includes("default-src 'self'"),
  );
  assert.ok(
    response.headers.get('strict-transport-security')?.includes('max-age='),
  );
});
test('readiness gates writable PostgreSQL while Redis degrades feature policies', async () => {
  databaseDown = true;
  let response = await fetch(`${origin}/api/v1/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable' });
  assert.equal((await fetch(`${origin}/api/v1/health`)).status, 200);

  databaseDown = false;
  redisDown = true;
  response = await fetch(`${origin}/api/v1/health/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  redisDown = false;
  assert.equal((await fetch(`${origin}/api/v1/health/ready`)).status, 200);
});
test('unexpected fields and invalid values use the common validation error format', async () => {
  const response = await fetch(`${origin}/api/v1/test-only`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 123, unexpected: true }),
  });
  assert.equal(response.status, 400);
  const body: unknown = await response.json();
  assert.ok(
    typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      body.code === 'VALIDATION_ERROR',
  );
  assert.ok(
    'requestId' in body &&
      body.requestId === response.headers.get('x-request-id'),
  );
  assert.ok(
    'details' in body &&
      Array.isArray(body.details) &&
      body.details.length === 2,
  );
});
test('parser errors and payload limits retain request ID and safe errors', async () => {
  for (const [payload, expected] of [
    ['{', 400],
    [JSON.stringify({ name: 'x'.repeat(110000) }), 413],
  ] as const) {
    const response = await fetch(`${origin}/api/v1/test-only`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'request_123456',
      },
      body: payload,
    });
    assert.equal(response.status, expected);
    const body: unknown = await response.json();
    assert.ok(
      typeof body === 'object' &&
        body !== null &&
        'requestId' in body &&
        body.requestId === 'request_123456',
    );
  }
});
test('unknown routes and unexpected failures do not leak internals', async () => {
  for (const [path, expected] of [
    ['/api/v1/missing', 404],
    ['/api/v1/test-only/error', 500],
  ] as const) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, expected);
    const body = await response.text();
    assert.ok(
      !body.includes('secret-password') &&
        !body.includes('SELECT') &&
        !body.includes('/internal/path') &&
        !body.includes('stack'),
    );
  }
});
test('CORS permits only the configured browser origin', async () => {
  const response = await fetch(`${origin}/api/v1/health`, {
    headers: { origin: 'http://localhost:3100' },
  });
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'http://localhost:3100',
  );
  const foreign = await fetch(`${origin}/api/v1/health`, {
    headers: { origin: 'https://foreign.example' },
  });
  assert.notEqual(
    foreign.headers.get('access-control-allow-origin'),
    'https://foreign.example',
  );
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), '*');
});
test('OpenAPI describes the actual versioned health routes', async () => {
  const response = await fetch(`${origin}/api/docs-json`);
  assert.equal(response.status, 200);
  const body: unknown = await response.json();
  assert.ok(
    typeof body === 'object' &&
      body !== null &&
      'paths' in body &&
      typeof body.paths === 'object' &&
      body.paths !== null &&
      '/api/v1/health' in body.paths &&
      '/api/v1/health/ready' in body.paths,
  );
});
