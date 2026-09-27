import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthClient, AuthApiError } from '../src/features/auth/auth-client';
import { PartApi } from '../src/features/parts/part-api';
import { SearchClient } from '../src/features/search/search-client';
import {
  parsePartOwner,
  parsePartPublic,
} from '../src/features/parts/part-response';
import {
  addFitment,
  changeFitmentMode,
  partFormPayload,
} from '../src/features/parts/part-form-model';
import {
  parsePartFilters,
  parsePartSearchParameters,
  validatePartSearch,
  validatePartFilterRange,
} from '../src/features/parts/part-filter-model';
import { parseSearchPage } from '../src/features/search/search-client';
import { ListingApi } from '../src/features/listings/listing-api';
import { ListingFields } from '../src/features/listings/listing-fields';
import { ListingCard } from '../src/features/listings/listing-summary';
import { SellChoice } from '../src/features/listings/sell-choice';
import { PartDetails } from '../src/features/parts/part-details';
const id = '20000000-0000-4000-8000-000000000001';
const row = {
  type: 'PART',
  id,
  title: 'Pads <script>evil()</script>',
  description: 'Stored as text',
  price: { amountMinor: '9007199254740993', currency: 'EUR' },
  status: 'DRAFT',
  publishedAt: null,
  soldAt: null,
  version: 7,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  submittedAt: null,
  archivedAt: null,
  location: null,
  part: {
    name: 'Brake pads',
    category: { id, name: 'Brakes', parentId: null },
    brand: null,
    condition: 'NEW',
    quantityAvailable: 3,
    manufacturerPartNumber: 'AB-12',
    oemNumber: null,
    fitmentMode: 'UNIVERSAL',
    fitments: [],
  },
};
const json = (value: unknown, etag?: string, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...(etag ? { etag } : {}) },
  });
test('sell entry offers separate cars and parts routes', () => {
  const html = renderToStaticMarkup(createElement(SellChoice));
  assert.match(html, /href="\/sell\/car"/);
  assert.match(html, /href="\/sell\/part"/);
});
test('fitment editor model validates years, rejects duplicates, bounds rows and preserves scope until discard confirmation', () => {
  const selection = {
    modelId: id,
    generationId: null,
    yearFrom: 2000,
    yearTo: 2020,
  };
  const rows = addFitment([], selection);
  assert.equal(rows.length, 1);
  assert.throws(() => addFitment(rows, { ...selection }), AuthApiError);
  assert.throws(
    () => addFitment([], { ...selection, yearFrom: 2021 }),
    AuthApiError,
  );
  assert.throws(
    () => addFitment([], { ...selection, yearTo: NaN }),
    AuthApiError,
  );
  const current = { mode: 'VEHICLE_SPECIFIC' as const, vehicles: rows };
  assert.equal(changeFitmentMode(current, 'UNIVERSAL', false), current);
  assert.deepEqual(changeFitmentMode(current, 'UNIVERSAL', true), {
    mode: 'UNIVERSAL',
    vehicles: [],
  });
});
test('part form uses shared int64 money/location payload, keeps spec name distinct and permits no location', () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    categoryId: id,
    name: 'Brake pads',
    condition: 'NEW',
    quantityAvailable: '3',
    manufacturerPartNumber: ' ab-12 ',
    oemNumber: '',
    title: 'Special offer',
    description: 'New pads',
    price: '90071992547409.93',
    currency: 'EUR',
  }))
    data.set(key, value);
  const body = partFormPayload(data, { mode: 'UNIVERSAL', vehicles: [] });
  assert.equal(body.listing.price.amountMinor, '9007199254740993');
  assert.equal(body.location, null);
  assert.equal(body.part.name, 'Brake pads');
  assert.equal(body.listing.title, 'Special offer');
  assert.equal(body.part.manufacturerPartNumber, 'AB-12');
  assert.equal(body.part.oemNumber, null);
  data.set('quantityAvailable', '0');
  assert.throws(() =>
    partFormPayload(data, { mode: 'UNIVERSAL', vehicles: [] }),
  );
});
test('part public parser discards exact coordinates and private listing/seller fields and never invents public point', () => {
  const value = parsePartPublic({
    ...row,
    status: 'PUBLISHED',
    seller: { id, displayName: 'Seller', email: 'private@example.test' },
    location: {
      city: 'Amsterdam',
      region: null,
      countryCode: 'NL',
      publicPoint: null,
      exactPoint: { latitude: 52.123456, longitude: 4.123456 },
    },
    vehicle: { vin: 'PRIVATE' },
    storageKey: 'SECRET',
  });
  const serialized = JSON.stringify(value);
  for (const secret of [
    'exactPoint',
    '52.123456',
    'version',
    'storageKey',
    'vin',
    'private@example.test',
  ])
    assert.equal(serialized.includes(secret), false);
  assert.equal(value.location?.publicPoint, null);
  assert.equal(value.type, 'PART');
  assert.throws(() =>
    parsePartPublic({
      ...row,
      type: 'VEHICLE',
      status: 'PUBLISHED',
      seller: { id, displayName: 'Seller' },
    }),
  );
});
test('common card discriminates part content and public route; fitment detail escapes seller text', () => {
  const detail = parsePartPublic({
    ...row,
    status: 'SOLD',
    seller: { id, displayName: 'Seller' },
  });
  const summary = {
    ...detail,
    part: { ...detail.part, fitment: { mode: 'UNIVERSAL' as const, count: 0 } },
  };
  const html = renderToStaticMarkup(
    createElement(ListingCard, { listing: summary }),
  );
  assert.match(html, /href="\/parts\//);
  assert.match(html, /Запчасть/);
  assert.equal(html.includes('<script>'), false);
  const owner = renderToStaticMarkup(
    createElement(ListingCard, { listing: summary, owner: true }),
  );
  assert.match(owner, /href="\/account\/listings\//);
  assert.match(
    renderToStaticMarkup(createElement(PartDetails, { part: detail.part })),
    /Универсальная запчасть/,
  );
});
test('common fields component supports part money and optional private location controls', () => {
  const html = renderToStaticMarkup(
    createElement(ListingFields, {
      initial: parsePartOwner(row),
      disabled: false,
    }),
  );
  assert.match(html, /name="price"/);
  assert.match(html, /90071992547409.93/);
  assert.match(html, /name="hasLocation"/);
  assert.equal(html.includes('name="year"'), false);
});
test('advanced part URL filters are canonical, safe and preserve compatibility/geo state', () => {
  const query = new URLSearchParams({
    categoryId: id,
    currency: 'EUR',
    priceFromMinor: '100',
    priceToMinor: '200',
    condition: 'NEW,USED',
    partNumber: 'AB-12',
    compatibleMakeId: id,
    compatibleModelId: id,
    compatibleGenerationId: id,
    compatibleYear: '2020',
    fitmentMode: 'VEHICLE_SPECIFIC',
    includeUniversal: 'false',
    includeSubcategories: 'true',
    sort: 'distance',
    lat: '52.1',
    lng: '4.1',
    radiusMeters: '50000',
    q: 'ignored',
  });
  assert.equal(
    parsePartFilters(parsePartFilters(query)).toString(),
    parsePartFilters(query).toString(),
  );
  assert.equal(parsePartFilters(query).has('q'), false);
  const parsed = parsePartSearchParameters(parsePartFilters(query));
  assert.equal(parsed.error, null);
  assert.equal(parsed.parameters.compatibleGenerationId, id);
  assert.equal(parsed.parameters.includeUniversal, 'false');
  assert.equal(parsed.parameters.sort, 'distance');
  assert.equal(
    parsePartFilters(
      new URLSearchParams(
        'condition=unknown&categoryId=bad&priceFromMinor=NaN',
      ),
    ).size,
    0,
  );
  assert.equal(
    parsePartFilters(
      new URLSearchParams('currency=EUR&priceFromMinor=100&priceToMinor=1'),
    ).has('priceFromMinor'),
    false,
  );
  assert.throws(() =>
    validatePartFilterRange(new URLSearchParams('priceFromMinor=1')),
  );
  assert.throws(() =>
    validatePartFilterRange(
      new URLSearchParams('currency=EUR&priceFromMinor=2&priceToMinor=1'),
    ),
  );
  assert.ok(
    validatePartSearch({
      compatibleGenerationId: id,
    }),
  );
});
test('unified discriminated parser keeps bounded Part compatibility summary and strips private fields', () => {
  const result = parseSearchPage({
    items: [
      {
        type: 'PART',
        id,
        title: 'Brake pads',
        price: { amountMinor: '10000', currency: 'EUR' },
        publishedAt: '2026-01-01T00:00:00.000001Z',
        cover: {
          url: 'https://processed.example.test/thumbnail.webp',
          width: 320,
          height: 240,
        },
        location: null,
        exactPoint: { latitude: 52.1, longitude: 4.1 },
        storageKey: 'private',
        part: {
          name: 'Brake pads',
          category: { id, name: 'Brakes', parentId: null },
          brand: null,
          condition: 'NEW',
          manufacturerPartNumber: 'AB-12',
          oemNumber: null,
          quantityAvailable: 2,
          fitment: {
            mode: 'VEHICLE_SPECIFIC',
            count: 7,
            samples: [
              {
                make: { id, name: 'BMW' },
                model: { id, name: '3 Series' },
                generation: null,
                yearFrom: 2010,
                yearTo: 2020,
              },
            ],
          },
        },
      },
    ],
    page: { hasNextPage: false, nextCursor: null },
  });
  const item = result.items[0];
  assert.equal(item?.type, 'PART');
  if (item?.type === 'PART') {
    assert.equal(item.location, null);
    assert.equal(item.part.fitment.count, 7);
    assert.equal(item.part.fitment.samples.length, 1);
  }
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('exactPoint'), false);
  assert.equal(serialized.includes('storageKey'), false);
});
test('part API edits its subtype route with CAS and common actions/read accept the part discriminant', async () => {
  const calls: string[] = [];
  const client = new AuthClient(async (path, init) => {
    calls.push(path);
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access', expiresIn: 600 });
    if (init?.method === 'PATCH')
      assert.equal(new Headers(init.headers).get('if-match'), '"7"');
    return json(row, '"7"');
  });
  const parts = new PartApi(client);
  const result = await parts.create({});
  assert.equal(result.listing.type, 'PART');
  await parts.update(id, '"7"', { quantityAvailable: 2 });
  assert.ok(calls.includes('/api/v1/me/part-listings/' + id));
  const api = new ListingApi(client);
  assert.equal((await api.ownDetail(id)).listing.type, 'PART');
  assert.equal((await api.action(id, '"7"', 'archive')).listing.type, 'PART');
  assert.ok(calls.includes('/api/v1/me/listings/' + id + '/archive'));
});
test('part stale edits propagate one conflict without silently retrying the mutation or corrupting draft', async () => {
  let writes = 0;
  const client = new AuthClient(async (path) => {
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access', expiresIn: 600 });
    writes++;
    return json({ code: 'LISTING_VERSION_CONFLICT' }, undefined, 409);
  });
  const body = { quantityAvailable: 5 };
  await assert.rejects(
    new PartApi(client).update(id, '"7"', body),
    (error: unknown) =>
      error instanceof AuthApiError &&
      error.code === 'LISTING_VERSION_CONFLICT',
  );
  assert.equal(writes, 1);
  assert.equal(body.quantityAvailable, 5);
});
test('unified part search forwards abort signal and rejects tampered owner ETag', async () => {
  const abort = new AbortController();
  const client = new AuthClient(async (path, init) => {
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access', expiresIn: 600 });
    if (path.includes('listings?type=PART')) {
      assert.equal(init?.signal, abort.signal);
      throw new DOMException('Aborted', 'AbortError');
    }
    return json(row, '"8"');
  });
  await assert.rejects(
    new SearchClient(client).listings('PART', {}, undefined, abort.signal),
  );
  await assert.rejects(new PartApi(client).create({}), AuthApiError);
});
test('shared seller list parses compact part summaries and transmits type filter without carrying full fitment payload', async () => {
  const summary = {
    ...row,
    part: {
      name: row.part.name,
      category: row.part.category,
      brand: row.part.brand,
      condition: row.part.condition,
      quantityAvailable: row.part.quantityAvailable,
      fitment: { mode: 'UNIVERSAL', count: 0 },
    },
  };
  const client = new AuthClient(async (path) => {
    if (path.endsWith('refresh'))
      return json({ accessToken: 'access', expiresIn: 600 });
    assert.match(path, /type=PART/);
    return json({ items: [summary], limit: 20, offset: 0, hasMore: false });
  });
  const page = await new ListingApi(client).ownList(
    0,
    '',
    'created_newest',
    undefined,
    'PART',
  );
  const result = page.items[0];
  assert.equal(result?.type, 'PART');
  if (result?.type === 'PART') {
    assert.equal(result.part.fitment.count, 0);
    assert.equal('fitments' in result.part, false);
  }
});
