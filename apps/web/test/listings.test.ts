import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthApiError, AuthClient } from '../src/features/auth/auth-client';
import {
  ListingApi,
  parsePublicListing,
} from '../src/features/listings/listing-api';
import {
  formPayload,
  isVersionConflict,
  minorFromDecimal,
  decimalFromMinor,
  selectMake,
  selectModel,
} from '../src/features/listings/listing-form-model';
import { ListingError } from '../src/features/listings/listing-feedback';
import {
  ListingCard,
  ListingDescription,
} from '../src/features/listings/listing-summary';

const uuid = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const json = (value: unknown, status = 200, etag?: string) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...(etag ? { etag } : {}) },
  });
const listing = {
  type: 'VEHICLE' as const,
  id: uuid,
  title: 'BMW <script>alert(1)</script>',
  description: 'Plain text',
  price: { amountMinor: '9007199254740993', currency: 'EUR' },
  status: 'DRAFT',
  publishedAt: null,
  soldAt: null,
  version: 7,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  submittedAt: null,
  archivedAt: null,
  vehicle: {
    id: uuid,
    make: { id: uuid, name: 'BMW' },
    model: { id: uuid, name: '3 Series' },
    generation: null,
    year: 2022,
    mileageKm: 12000,
    bodyType: 'SEDAN',
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    driveType: 'RWD',
    condition: 'USED',
    enginePowerHp: null,
    engineDisplacementCc: null,
    color: null,
    vin: 'WBA8A9C50GK123456',
  },
  location: null,
};

test('dependent catalog selection resets stale model and generation IDs', () => {
  const before = { makeId: uuid, modelId: uuid, generationId: other };
  assert.deepEqual(selectMake(before, other), {
    makeId: other,
    modelId: '',
    generationId: '',
  });
  assert.deepEqual(selectModel(before, other), {
    makeId: uuid,
    modelId: other,
    generationId: '',
  });
  assert.equal(selectMake(before, uuid), before);
});
test('form money conversion preserves int64 precision and handles currency exponents without floats', () => {
  assert.equal(
    minorFromDecimal('90071992547409,93', 'EUR'),
    '9007199254740993',
  );
  assert.equal(
    decimalFromMinor('9007199254740993', 'EUR'),
    '90071992547409.93',
  );
  assert.equal(
    minorFromDecimal('9223372036854775807', 'JPY'),
    '9223372036854775807',
  );
  for (const value of ['0', '-1', '1.001', '1e3', '92233720368547758.08'])
    assert.throws(() => minorFromDecimal(value, 'EUR'), AuthApiError);
  assert.throws(() => minorFromDecimal('1.5', 'JPY'), AuthApiError);
  assert.throws(() => minorFromDecimal('1', 'ZZZ'), AuthApiError);
});
test('seller form creates normalized payload and never copies exact point into public point', () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    year: '2022',
    mileageKm: '12000',
    bodyType: 'SEDAN',
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    driveType: 'RWD',
    condition: 'USED',
    title: ' BMW ',
    description: 'Example',
    price: '25000.00',
    currency: 'EUR',
    vin: ' wba8a9c50gk123456 ',
    hasLocation: 'on',
    latitude: '52.3676',
    longitude: '4.9041',
    city: ' Amsterdam ',
    countryCode: 'nl',
  }))
    data.set(key, value);
  const payload = formPayload(data, {
    makeId: uuid,
    modelId: uuid,
    generationId: '',
  });
  assert.equal(payload.vehicle.vin, 'WBA8A9C50GK123456');
  assert.equal(payload.vehicle.generationId, null);
  assert.equal(payload.listing.price.amountMinor, '2500000');
  assert.equal(payload.location?.publicPoint, null);
  assert.equal(payload.location?.latitude, 52.3676);
  assert.equal(payload.location?.longitude, 4.9041);
  assert.equal(payload.location?.countryCode, 'NL');
  data.set('mileageKm', '1.5');
  assert.throws(
    () => formPayload(data, { makeId: uuid, modelId: uuid, generationId: '' }),
    AuthApiError,
  );
});
test('listing client reuses auth single-flight refresh and sends the exact owner ETag', async () => {
  const calls: string[] = [];
  let refreshes = 0;
  const client = new AuthClient(async (path, init) => {
    calls.push(path);
    if (path.endsWith('refresh')) {
      refreshes++;
      return json({ accessToken: `access-${refreshes}`, expiresIn: 600 });
    }
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer access-1',
    );
    if (init?.method === 'PATCH') {
      assert.equal(new Headers(init.headers).get('if-match'), '"7"');
      return json({ ...listing, version: 8 }, 200, '"8"');
    }
    return json(listing, 200, '"7"');
  });
  const api = new ListingApi(client);
  const results = await Promise.all([api.ownDetail(uuid), api.ownDetail(uuid)]);
  assert.equal(refreshes, 1);
  assert.equal(results[0]?.etag, '"7"');
  const updated = await api.update(uuid, '"7"', {
    listing: { title: 'Edited' },
  });
  assert.equal(updated.listing.version, 8);
  assert.ok(calls.includes(`/api/v1/me/listings/${uuid}`));
});
test('version conflict propagates without resending a write or overwriting unsaved form data', async () => {
  let writes = 0;
  const client = new AuthClient(async (path) => {
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access', expiresIn: 600 });
    writes++;
    return json({ code: 'LISTING_VERSION_CONFLICT' }, 409);
  });
  const unsaved = { listing: { title: 'Unsaved title' } };
  await assert.rejects(
    new ListingApi(client).update(uuid, '"7"', unsaved),
    isVersionConflict,
  );
  assert.equal(writes, 1);
  assert.equal(unsaved.listing.title, 'Unsaved title');
});
test('API error UI renders a safe actionable message and never renders server exception text', () => {
  const conflict = renderToStaticMarkup(
    createElement(ListingError, {
      error: new AuthApiError(409, 'LISTING_VERSION_CONFLICT'),
    }),
  );
  assert.match(conflict, /role="alert"/);
  assert.match(conflict, /Обновите данные/);
  const unexpected = renderToStaticMarkup(
    createElement(ListingError, {
      error: new Error('<script>private SQL</script>'),
    }),
  );
  assert.equal(unexpected.includes('private SQL'), false);
  assert.equal(unexpected.includes('<script>'), false);
});
test('public parser rejects hidden statuses and strips unexpected sensitive fields', () => {
  assert.throws(
    () =>
      parsePublicListing({
        ...listing,
        seller: { id: uuid, displayName: 'Seller' },
      }),
    AuthApiError,
  );
  const publicDto = parsePublicListing({
    ...listing,
    status: 'PUBLISHED',
    seller: { id: uuid, displayName: 'Seller', email: 'private@example.test' },
  });
  const serialized = JSON.stringify(publicDto);
  for (const privateValue of [
    'vin',
    'version',
    'private@example.test',
    'WBA8A9C50GK123456',
  ])
    assert.equal(serialized.includes(privateValue), false);
});
test('listing title and description render as escaped text instead of executable markup', () => {
  const publicDto = parsePublicListing({
    ...listing,
    status: 'PUBLISHED',
    seller: { id: uuid, displayName: 'Seller' },
  });
  const card = renderToStaticMarkup(
    createElement(ListingCard, { listing: publicDto }),
  );
  const description = renderToStaticMarkup(
    createElement(ListingDescription, {
      description: '<script>alert(1)</script>\n<img onerror="evil()">',
    }),
  );
  assert.equal(card.includes('<script>'), false);
  assert.ok(card.includes('&lt;script&gt;'));
  assert.equal(description.includes('<script>'), false);
  assert.equal(description.includes('<img'), false);
  assert.ok(description.includes('&lt;script&gt;'));
  assert.ok(description.includes('\n'));
});
test('malformed owner response or mismatched ETag is rejected before it can be used for editing', async () => {
  const client = new AuthClient(async (path) =>
    path.endsWith('refresh')
      ? json({ accessToken: 'access', expiresIn: 600 })
      : json(listing, 200, '"8"'),
  );
  await assert.rejects(
    new ListingApi(client).ownDetail(uuid),
    (error: unknown) =>
      error instanceof AuthApiError && error.code === 'INVALID_API_RESPONSE',
  );
  await assert.rejects(
    client.apiAuthenticated('https://external.example/steal'),
    AuthApiError,
  );
});
