import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import {
  isAuthRoute,
  isNavigationActive,
  unreadLabel,
  boundedUnread,
} from '../src/features/shell/navigation-model';
import { PersonalLink } from '../src/features/shell/global-header';
import { homeSearchTarget } from '../src/features/home/home-search-model';
import { loadLatestListings } from '../src/features/home/home-listings';
import {
  LatestContent,
  LatestLoading,
} from '../src/features/home/latest-listings';

test('active navigation respects category boundaries and existing vehicle detail routes', () => {
  for (const route of ['/cars', '/cars/example', '/listings/uuid'])
    assert.equal(isNavigationActive(route, '/cars'), true);
  for (const route of ['/parts', '/parts/uuid'])
    assert.equal(isNavigationActive(route, '/parts'), true);
  assert.equal(isNavigationActive('/parts-tools', '/parts'), false);
  assert.equal(isNavigationActive('/parts/uuid', '/cars'), false);
  assert.equal(isNavigationActive('/account/messages', '/account'), true);
});

test('simplified auth shell applies only to real auth routes', () => {
  for (const route of [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ])
    assert.equal(isAuthRoute(route), true);
  assert.equal(isAuthRoute('/account/security'), false);
  assert.equal(isAuthRoute('/login-extra'), false);
});

test('unread indicators are bounded and described without duplicate live announcements', () => {
  assert.equal(boundedUnread(null), null);
  assert.equal(boundedUnread(0), null);
  assert.equal(boundedUnread(99), '99');
  assert.equal(boundedUnread(1254), '99+');
  assert.equal(unreadLabel('Сообщения', 3), 'Сообщения, непрочитанных: 3');
  const html = render(
    h(PersonalLink, {
      href: '/account/messages',
      label: 'Сообщения',
      icon: 'message',
      count: 1254,
    }),
  );
  assert.match(html, /aria-label="Сообщения, непрочитанных: 99\+"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /1254|aria-live|role="status"/);
});

test('home quick search reuses canonical category validators and URL serialization', () => {
  assert.deepEqual(homeSearchTarget('VEHICLE', ''), { href: '/cars' });
  assert.deepEqual(homeSearchTarget('PART', ' '), { href: '/parts' });
  assert.deepEqual(homeSearchTarget('VEHICLE', '2020'), {
    href: '/cars?yearFrom=2020',
  });
  assert.deepEqual(homeSearchTarget('PART', ' OEM/123 '), {
    href: '/parts?partNumber=OEM%2F123',
  });
  assert.ok(homeSearchTarget('VEHICLE', '9999').error);
  assert.ok(homeSearchTarget('PART', '<script>').error);
});

test('latest requests use public bounded uncached transport without credentials', async () => {
  const fetcher: typeof fetch = async (input, options) => {
    assert.equal(
      String(input),
      'http://api.test/api/v1/listings?type=PART&sort=newest&limit=4',
    );
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.headers, undefined);
    assert.ok(options?.signal);
    return Response.json({
      items: [],
      page: { hasNextPage: false, nextCursor: null },
    });
  };
  assert.deepEqual(
    await loadLatestListings('http://api.test', 'PART', fetcher),
    { status: 'ready', items: [] },
  );
});

test('partial API failure leaves the other latest section independently available', async () => {
  const fetcher: typeof fetch = async (input) =>
    String(input).includes('VEHICLE')
      ? new Response('unavailable', { status: 503 })
      : Response.json({
          items: [],
          page: { hasNextPage: false, nextCursor: null },
        });
  const [cars, parts] = await Promise.all([
    loadLatestListings('http://api.test', 'VEHICLE', fetcher),
    loadLatestListings('http://api.test', 'PART', fetcher),
  ]);
  assert.deepEqual(cars, { status: 'error' });
  assert.deepEqual(parts, { status: 'ready', items: [] });
  const html = render(
    h(
      'div',
      {},
      h(LatestContent, { state: cars, type: 'VEHICLE' }),
      h(LatestContent, { state: parts, type: 'PART' }),
    ),
  );
  assert.match(html, /Объявления временно недоступны/);
  assert.match(html, /Новые запчасти появятся здесь/);
  assert.doesNotMatch(html, /503|unavailable/);
});

test('malformed and network-failed latest responses become safe section errors', async () => {
  assert.deepEqual(
    await loadLatestListings('http://api.test', 'VEHICLE', async () =>
      Response.json({ items: [{ type: 'PART' }] }),
    ),
    { status: 'error' },
  );
  assert.deepEqual(
    await loadLatestListings('http://api.test', 'PART', async () => {
      throw new Error('private host');
    }),
    { status: 'error' },
  );
});

test('empty sections and loading retain usable semantic content without fake listings', () => {
  const empty = render(
    h(LatestContent, {
      state: { status: 'ready', items: [] },
      type: 'VEHICLE',
    }),
  );
  assert.match(empty, /href="\/sell"/);
  assert.doesNotMatch(empty, /listing-card|role="alert"/);
  assert.match(render(h(LatestLoading)), /aria-busy="true"/);
});
