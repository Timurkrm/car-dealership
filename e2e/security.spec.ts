import { test, expect, type APIRequestContext } from '@playwright/test';
import { password, users } from './helpers';

const trustedOrigin = 'http://127.0.0.1:3200';

async function access(request: APIRequestContext, email: string) {
  const response = await request.post('/api/v1/auth/login', {
    headers: { origin: trustedOrigin },
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { accessToken: string };
  return { authorization: `Bearer ${body.accessToken}` };
}

test('security headers, CSP and cross-origin policy @security', async ({
  page,
  request,
}) => {
  const response = await page.goto('/cars');
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("object-src 'none'");
  expect(headers['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  const cors = await request.get('http://127.0.0.1:4200/api/v1/health', {
    headers: { origin: 'https://attacker.example' },
  });
  expect(cors.headers()['access-control-allow-origin']).not.toBe(
    'https://attacker.example',
  );
});

test('SQL/XSS payloads and abusive query bounds are rejected safely @security', async ({
  page,
  request,
}) => {
  const cases = [
    '/api/v1/listings?sort=price_desc%3BDROP%20TABLE%20listings',
    '/api/v1/listings?type=VEHICLE&limit=100000',
    '/api/v1/search/listings/map?type=VEHICLE&viewport=-181,-90,180,90&zoom=4',
    '/api/v1/listings?type=VEHICLE&lat=52&lng=5&radiusMeters=999999999',
    '/api/v1/listings?type=PART&makeId=10000000-0000-4000-8000-000000000001',
  ];
  for (const path of cases) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(400);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toMatch(/SEARCH_|GEO_|MAP_|VALIDATION/);
  }
  await page.goto('/cars?bodyType=%3Cimg%20src=x%20onerror=alert(1)%3E');
  await expect(page.getByText(/Проверьте категории фильтров/)).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test('anonymous, owner, moderator and admin boundaries resist IDOR @security', async ({
  request,
}) => {
  const listing = '60000000-0000-4000-8000-000000000001';
  expect((await request.get(`/api/v1/me/listings/${listing}`)).status()).toBe(
    401,
  );
  const buyer = await access(request, users.buyer);
  expect(
    (
      await request.get(`/api/v1/me/listings/${listing}`, { headers: buyer })
    ).status(),
  ).toBe(404);
  expect(
    (await request.get('/api/v1/admin/users', { headers: buyer })).status(),
  ).toBe(403);
  const moderator = await access(request, users.moderator);
  expect(
    (await request.get('/api/v1/admin/users', { headers: moderator })).status(),
  ).toBe(403);
  const admin = await access(request, users.admin);
  expect(
    (
      await request.get('/api/v1/admin/users?limit=20', { headers: admin })
    ).status(),
  ).toBe(200);
});

test('body limits, mass assignment and blocked login fail closed @security', async ({
  request,
}) => {
  const oversized = await request.post('/api/v1/auth/register', {
    headers: { 'content-type': 'application/json', origin: trustedOrigin },
    data: {
      email: 'large@example.test',
      displayName: 'x'.repeat(1_200_000),
      password,
    },
  });
  expect([400, 413]).toContain(oversized.status());
  const blocked = await request.post('/api/v1/auth/login', {
    headers: { origin: trustedOrigin },
    data: { email: users.blocked, password },
  });
  expect(blocked.status()).toBe(403);
  const seller = await access(request, users.seller);
  const response = await request.post('/api/v1/listings', {
    headers: { ...seller, origin: trustedOrigin },
    data: {
      sellerId: users.buyer,
      status: 'PUBLISHED',
      title: 'Mass assignment',
    },
  });
  expect(response.status()).toBe(400);
});
