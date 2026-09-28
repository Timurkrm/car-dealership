import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AuthClient, AuthApiError } from '../src/features/auth/auth-client';

const user = {
  id: 'test-user',
  displayName: 'Seller',
  email: 'seller@example.test',
  roles: ['USER'],
  status: 'ACTIVE',
  emailVerifiedAt: '2026-09-17T00:00:00Z',
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
test('transport is invoked without AuthClient as a browser-host receiver', async () => {
  function transport(this: unknown, path: string): Promise<Response> {
    assert.equal(this, undefined);
    assert.equal(path, '/api/v1/catalog/vehicle-makes?limit=1');
    return Promise.resolve(json({ items: [], hasMore: false }));
  }
  const client = new AuthClient(transport);
  await client.api('catalog/vehicle-makes?limit=1');
});
test('successful reset clears the previously authenticated browser identity', async () => {
  const client = new AuthClient(async (path) => {
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access', expiresIn: 600 });
    if (path.endsWith('password/reset'))
      return new Response(null, { status: 204 });
    return json(user);
  });
  await client.bootstrap();
  assert.equal(client.getSnapshot().status, 'authenticated');
  await client.post('password/reset', {
    token: 'action-token',
    newPassword: 'new safe passphrase',
  });
  assert.deepEqual(client.getSnapshot(), { status: 'anonymous', user: null });
});
test('bootstrap deduplicates refresh and me; credentials stay in instance memory', async () => {
  const calls: string[] = [];
  const client = new AuthClient(async (path, init) => {
    calls.push(path);
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.cache, 'no-store');
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access-one', expiresIn: 600 });
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer access-one',
    );
    return json(user);
  });
  await Promise.all(Array.from({ length: 10 }, () => client.bootstrap()));
  assert.deepEqual(calls, ['/api/v1/auth/refresh', '/api/v1/auth/me']);
  assert.equal(client.getSnapshot().status, 'authenticated');
  assert.equal('accessToken' in client.getSnapshot(), false);
});
test('parallel unauthorized requests share one refresh and retry only once', async () => {
  let refreshes = 0;
  const client = new AuthClient(async (path, init) => {
    if (path.endsWith('refresh')) {
      refreshes++;
      return json({ accessToken: `access-${refreshes}`, expiresIn: 600 });
    }
    if (new Headers(init?.headers).get('authorization') === 'Bearer access-1')
      return json({ code: 'AUTHENTICATION_REQUIRED' }, 401);
    return json(user);
  });
  await client.refresh();
  await Promise.all(
    Array.from({ length: 12 }, () => client.authenticated('me')),
  );
  assert.equal(refreshes, 2);
});
test('invalid session becomes anonymous, infrastructure failure remains retryable and logout clears memory', async () => {
  const expired = new AuthClient(async () =>
    json({ code: 'SESSION_EXPIRED' }, 401),
  );
  await expired.bootstrap();
  assert.deepEqual(expired.getSnapshot(), { status: 'anonymous', user: null });
  let down = true;
  const client = new AuthClient(async (path) => {
    if (down) return json({ code: 'AUTH_RATE_LIMIT_UNAVAILABLE' }, 503);
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access', expiresIn: 600 });
    if (path.endsWith('logout')) return new Response(null, { status: 204 });
    return json(user);
  });
  await client.bootstrap();
  assert.equal(client.getSnapshot().status, 'unavailable');
  down = false;
  await client.bootstrap();
  assert.equal(client.getSnapshot().status, 'authenticated');
  await client.logout();
  assert.deepEqual(client.getSnapshot(), { status: 'anonymous', user: null });
});
test('malformed responses and denied retry do not create infinite refresh loops', async () => {
  let refreshes = 0;
  const client = new AuthClient(async (path) => {
    if (path.endsWith('refresh')) {
      refreshes++;
      return json({ accessToken: 'access', expiresIn: 600 });
    }
    return json({ code: 'AUTHENTICATION_REQUIRED' }, 401);
  });
  await assert.rejects(() => client.authenticated('me'), AuthApiError);
  assert.equal(refreshes, 2);
  assert.equal(client.getSnapshot().status, 'anonymous');
  const malformed = new AuthClient(async () =>
    json({ passwordHash: 'forbidden' }),
  );
  await assert.rejects(
    () => malformed.refresh(),
    (error: unknown) =>
      error instanceof AuthApiError && error.code === 'INVALID_API_RESPONSE',
  );
});
test('account blocking clears stale UI identity without refreshing forbidden requests', async () => {
  let blocked = false;
  const client = new AuthClient(async (path) =>
    path.endsWith('refresh')
      ? json({ accessToken: 'access', expiresIn: 600 })
      : blocked
        ? json({ code: 'ACCOUNT_BLOCKED' }, 403)
        : json(user),
  );
  await client.bootstrap();
  blocked = true;
  await assert.rejects(() => client.authenticated('me'), AuthApiError);
  assert.equal(client.getSnapshot().status, 'anonymous');
});
