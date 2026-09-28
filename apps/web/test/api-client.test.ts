import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiClient, ApiClientError } from '../src/lib/api-client';
import { webConfig } from '../src/config';
import { webSecurityHeaders } from '../src/security-headers';

test('server configuration rejects missing, credential-bearing and invalid API origins', () => {
  for (const value of [
    undefined,
    'file:///tmp',
    'http://user:password@example.com',
    'http://example.com/api',
  ])
    assert.throws(() => webConfig({ API_URL: value }));
  assert.deepEqual(
    webConfig({ API_URL: 'http://api.internal:4000/', NODE_ENV: 'production' }),
    { apiUrl: 'http://api.internal:4000', showDiagnostics: false },
  );
});
test('web security headers constrain framing, content and provider connections', () => {
  const headers = Object.fromEntries(
    webSecurityHeaders('https://maps.example.test/style.json').map((header) => [
      header.key.toLowerCase(),
      header.value,
    ]),
  );
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'no-referrer');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.ok(headers['strict-transport-security']?.includes('max-age='));
  assert.ok(
    headers['content-security-policy']?.includes("frame-ancestors 'none'"),
  );
  assert.equal(
    headers['content-security-policy']?.includes('api.internal'),
    false,
  );
  assert.ok(
    headers['content-security-policy']?.includes('https://maps.example.test'),
  );
  assert.equal(
    headers['content-security-policy']?.includes('unsafe-eval'),
    false,
  );
});
test('health client uses configured URL, avoids cache and accepts a valid response', async () => {
  const transport: typeof fetch = async (input, init) => {
    assert.equal(input, 'https://api.example.com/api/v1/health');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'omit');
    return Response.json({ status: 'ok' });
  };
  assert.deepEqual(
    await new ApiClient('https://api.example.com', transport).health(),
    { status: 'ok' },
  );
});
test('health client handles HTTP, parsing and network failures', async () => {
  const cases: [typeof fetch, string][] = [
    [async () => Response.json({}, { status: 503 }), 'HTTP_ERROR'],
    [async () => Response.json({ status: 'other' }), 'INVALID_RESPONSE'],
    [async () => new Response('{'), 'INVALID_RESPONSE'],
    [
      async () => {
        throw new Error('network');
      },
      'NETWORK_ERROR',
    ],
  ];
  for (const [transport, code] of cases)
    await assert.rejects(
      () => new ApiClient('https://api.example.com', transport).health(),
      (error: unknown) =>
        error instanceof ApiClientError && error.code === code,
    );
});
test('health client forwards caller cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  const transport: typeof fetch = async (_input, init) => {
    assert.ok(init?.signal?.aborted);
    throw new Error('aborted');
  };
  await assert.rejects(
    () =>
      new ApiClient('https://api.example.com', transport).health(
        controller.signal,
      ),
    ApiClientError,
  );
});
