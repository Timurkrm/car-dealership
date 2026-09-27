import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AuthClient } from '../src/features/auth/auth-client';
import { loginHref, safeReturnTo } from '../src/features/auth/auth-return';
import { EngagementClient } from '../src/features/engagement/engagement-client';

const listingId = '60000000-0000-4000-8000-000000000001';
const resourceId = '70000000-0000-4000-8000-000000000001';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('engagement login return path stays internal', () => {
  const origin = 'https://marketplace.example';
  assert.equal(
    loginHref('/parts?category=brakes'),
    '/login?returnTo=%2Fparts%3Fcategory%3Dbrakes',
  );
  assert.equal(
    safeReturnTo('/listings/60000000-0000-4000-8000-000000000001', origin),
    '/listings/60000000-0000-4000-8000-000000000001',
  );
  for (const unsafe of [
    'https://attacker.example',
    '//attacker.example/path',
    '/login',
    '/\\attacker.example',
  ])
    assert.equal(safeReturnTo(unsafe, origin), '/account');
});

test('engagement client uses authenticated idempotent favorite operations and mixed safe cards', async () => {
  const calls: { path: string; method: string }[] = [];
  const auth = new AuthClient(async (path, init) => {
    calls.push({ path, method: init?.method ?? 'GET' });
    if (path.endsWith('/auth/refresh'))
      return json({ accessToken: 'memory-only', expiresIn: 600 });
    if (path.includes('me/favorites?'))
      return json({
        items: [
          {
            kind: 'VEHICLE',
            listingId,
            title: 'Car',
            availability: 'AVAILABLE',
            price: { amountMinor: '10000', currency: 'EUR' },
            cover: {
              url: 'https://img.example.test/a.webp',
              width: 320,
              height: 240,
            },
            addedAt: '2026-09-01T00:00:00Z',
            vehicle: {
              make: { name: 'BMW' },
              model: { name: '3' },
              year: 2022,
              mileageKm: 1000,
            },
          },
          {
            kind: 'UNAVAILABLE',
            listingId: resourceId,
            availability: 'UNAVAILABLE',
            addedAt: '2026-09-01T00:00:00Z',
            exactPoint: [52, 4],
            title: 'must not be read',
          },
        ],
        page: { hasNextPage: false, nextCursor: null },
      });
    return new Response(null, { status: 204 });
  });
  const api = new EngagementClient(auth);
  await api.favorite(listingId);
  await api.unfavorite(listingId);
  const page = await api.favorites('VEHICLE');
  assert.equal(page.items[1]?.kind, 'UNAVAILABLE');
  assert.equal(JSON.stringify(page.items).includes('exactPoint'), false);
  assert.deepEqual(
    calls
      .filter((call) => call.path.includes(`favorites/${listingId}`))
      .map((call) => call.method),
    ['PUT', 'DELETE'],
  );
});

test('saved search client preserves canonical string filters and mutations', async () => {
  const calls: { path: string; body?: string }[] = [];
  const saved = {
    id: resourceId,
    name: 'BMW',
    type: 'VEHICLE',
    schemaVersion: 2,
    supported: true,
    filters: { makeId: listingId, fuelType: 'DIESEL,PETROL' },
    notificationsEnabled: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };
  const auth = new AuthClient(async (path, init) => {
    calls.push({
      path,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    if (path.endsWith('/auth/refresh'))
      return json({ accessToken: 'token', expiresIn: 600 });
    if ((init?.method ?? 'GET') === 'DELETE')
      return new Response(null, { status: 204 });
    if (path === '/api/v1/me/saved-searches' && !init?.method)
      return json({ items: [saved], limit: 50 });
    return json(saved);
  });
  const api = new EngagementClient(auth);
  assert.equal(
    (await api.savedSearches())[0]?.filters.fuelType,
    'DIESEL,PETROL',
  );
  await api.createSavedSearch({
    name: 'BMW',
    type: 'VEHICLE',
    filters: { makeId: listingId },
    notificationsEnabled: true,
  });
  await api.updateSavedSearch(resourceId, { notificationsEnabled: false });
  await api.removeSavedSearch(resourceId);
  assert.ok(calls.some((call) => call.body?.includes('notificationsEnabled')));
});

test('notification client parses unknown types safely and supports read actions', async () => {
  const calls: string[] = [];
  const auth = new AuthClient(async (path) => {
    calls.push(path);
    if (path.endsWith('/auth/refresh'))
      return json({ accessToken: 'token', expiresIn: 600 });
    if (path.endsWith('/unread-count')) return json({ count: 3 });
    if (path.includes('me/notifications?'))
      return json({
        items: [
          {
            id: resourceId,
            type: 'FUTURE_TYPE',
            createdAt: '2026-09-01T00:00:00Z',
            readAt: null,
            content: {},
            target: null,
          },
        ],
        page: { hasNextPage: false, nextCursor: null },
      });
    return json({ id: resourceId, readAt: '2026-09-01T00:00:00Z' });
  });
  const api = new EngagementClient(auth);
  assert.equal(await api.unreadCount(), 3);
  assert.equal((await api.notifications()).items[0]?.type, 'FUTURE_TYPE');
  await api.markRead(resourceId);
  await api.markAllRead();
  assert.ok(calls.some((path) => path.endsWith(`${resourceId}/read`)));
  assert.ok(calls.some((path) => path.endsWith('read-all')));
});
