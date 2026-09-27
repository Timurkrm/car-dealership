import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AuthClient } from '../src/features/auth/auth-client';
import {
  AccountClient,
  parsePreferences,
  parseProfile,
  parseSessions,
} from '../src/features/account/account-client';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const user = {
  id: 'u',
  displayName: 'Имя',
  email: 'a@example.test',
  roles: ['USER'],
  status: 'ACTIVE',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
};

test('account response parsers allowlist profile, session and immutable security preference', () => {
  assert.equal(
    parseProfile({
      id: 'u',
      displayName: 'Имя',
      email: 'a@example.test',
      emailVerifiedAt: null,
      pendingEmail: 'b@example.test',
    }).pendingEmail,
    'b@example.test',
  );
  assert.equal(
    parseSessions([
      {
        id: 's',
        createdAt: '2026-01-01',
        lastActivityAt: '2026-01-02',
        expiresAt: '2026-02-01',
        current: true,
      },
    ])[0]?.current,
    true,
  );
  assert.throws(() =>
    parsePreferences({
      messagesEmail: true,
      savedSearchesEmail: false,
      favoritesEmail: true,
      moderationEmail: true,
      securityEmail: false,
    }),
  );
});

test('revoking current session clears in-memory auth while other-session revoke preserves it', async () => {
  const requests: Array<{ path: string; method?: string }> = [];
  const auth = new AuthClient(async (path, init) => {
    requests.push({ path, method: init?.method });
    if (path.endsWith('/refresh'))
      return json({ accessToken: 'token', expiresIn: 600 });
    if (path.endsWith('/auth/me')) return json(user);
    return new Response(null, { status: 204 });
  });
  await auth.bootstrap();
  const account = new AccountClient(auth);
  await account.revokeSession('11111111-1111-4111-8111-111111111111', false);
  assert.equal(auth.getSnapshot().status, 'authenticated');
  await account.revokeSession('22222222-2222-4222-8222-222222222222', true);
  assert.equal(auth.getSnapshot().status, 'anonymous');
  assert.deepEqual(
    requests.slice(-2).map((request) => request.method),
    ['DELETE', 'DELETE'],
  );
});

test('preference update sends only mutable typed switches', async () => {
  let body = '';
  const auth = new AuthClient(async (path, init) => {
    if (path.endsWith('/refresh'))
      return json({ accessToken: 'token', expiresIn: 600 });
    if (path.endsWith('/auth/me')) return json(user);
    body = String(init?.body);
    return json({
      messagesEmail: false,
      savedSearchesEmail: true,
      favoritesEmail: false,
      moderationEmail: true,
      securityEmail: true,
    });
  });
  await auth.bootstrap();
  await new AccountClient(auth).updatePreferences({
    messagesEmail: false,
    savedSearchesEmail: true,
    favoritesEmail: false,
    moderationEmail: true,
  });
  assert.deepEqual(Object.keys(JSON.parse(body) as object).sort(), [
    'favoritesEmail',
    'messagesEmail',
    'moderationEmail',
    'savedSearchesEmail',
  ]);
});
