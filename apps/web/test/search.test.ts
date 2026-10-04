import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseSearchParameters,
  serializeSearchParameters,
  changeCatalog,
  filterFormParameters,
  formatSearchDistance,
  requestSearchOrigin,
  validateSearch,
} from '../src/features/search/search-parameters';
import {
  SearchClient,
  parseMapResponse,
  parseSearchPage,
} from '../src/features/search/search-client';
import type { SearchPage } from '../src/features/search/search-client';
import { SearchSession } from '../src/features/search/search-session';
import { SearchResults } from '../src/features/search/search-screen';
import { SearchFilters } from '../src/features/search/search-filters';
import { AuthClient, AuthApiError } from '../src/features/auth/auth-client';
import { AuthProvider } from '../src/features/auth/auth-provider';
import { FavoriteProvider } from '../src/features/engagement/favorite-provider';
import { ListingApi } from '../src/features/listings/listing-api';
import {
  boundsParameter,
  catalogUrl,
  parseMapUrlState,
  searchInArea,
  searchOnlyParameters,
} from '../src/features/map/map-state';
import { MapSession } from '../src/features/map/map-session';
import { publicMapConfig } from '../src/features/map/map-config';

const id = '60000000-0000-4000-8000-000000000001';
const rawItem = {
  type: 'VEHICLE',
  id,
  title: '<script>unsafe</script>',
  price: { amountMinor: '9007199254740993', currency: 'EUR' },
  publishedAt: '2026-01-01T00:00:00.000001Z',
  vehicle: {
    make: { id, name: 'BMW' },
    model: { id, name: '3 Series' },
    generation: null,
    year: 2022,
    mileageKm: 10000,
    bodyType: 'SEDAN',
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    driveType: 'RWD',
    condition: 'USED',
    color: 'BLUE',
    vin: 'private',
  },
  cover: {
    url: 'https://processed.example.test/thumbnail.webp',
    width: 320,
    height: 240,
  },
  location: {
    city: 'City',
    region: null,
    countryCode: 'NL',
    publicPoint: null,
    distanceMeters: 0,
    exactPoint: { latitude: 10, longitude: 10 },
  },
  seller: { email: 'private@example.test' },
  storageKey: 'private-source',
  version: 123,
};
const page = (nextCursor: string | null = null, idOverride = id): SearchPage =>
  parseSearchPage({
    items: [{ ...rawItem, id: idOverride }],
    page: { nextCursor, hasNextPage: nextCursor !== null },
  });
test('URL round trip, stable serialization and invalid URLs have safe feedback', () => {
  const parameters = {
    makeId: id,
    fuelType: 'PETROL,DIESEL',
    yearFrom: '2020',
    currency: 'EUR',
    priceFromMinor: '9007199254740993',
    sort: 'price_asc',
    lat: '52.123456',
    lng: '4.123456',
    radiusMeters: '50000',
  };
  const serialized = serializeSearchParameters(parameters);
  const parsed = parseSearchParameters(new URLSearchParams(serialized));
  assert.equal(parsed.error, null);
  assert.equal(serializeSearchParameters(parsed.parameters), serialized);
  for (const query of [
    'yearFrom=NaN',
    'yearFrom=2023&yearTo=2020',
    'lat=Infinity&lng=0',
    'makeId=bad',
    'fuelType=PETROL&fuelType=DIESEL',
    'unknown=true',
  ]) {
    const result = parseSearchParameters(new URLSearchParams(query));
    assert.ok(result.error, query);
    assert.deepEqual(result.parameters, {});
  }
});
test('parent filter changes reset incompatible children and preserve other filters', () => {
  const initial = {
    makeId: id,
    modelId: id,
    generationId: id,
    yearFrom: '2020',
  };
  const make = changeCatalog(initial, 'makeId', 'other');
  assert.equal(make.modelId, undefined);
  assert.equal(make.generationId, undefined);
  assert.equal(make.yearFrom, '2020');
  const model = changeCatalog(initial, 'modelId', 'other');
  assert.equal(model.generationId, undefined);
  assert.equal(model.makeId, id);
});
test('Apply validates ranges, exact money and multi-select, without queries per keypress', () => {
  const form = new FormData();
  form.set('currency', 'EUR');
  form.set('priceFrom', '90071992547409.93');
  form.set('priceTo', '90071992547409.94');
  form.set('yearFrom', '2020');
  form.set('yearTo', '2023');
  form.set('sort', 'price_desc');
  form.append('fuelType', 'PETROL');
  form.append('fuelType', 'DIESEL');
  const parameters = filterFormParameters(form, { makeId: id });
  assert.equal(parameters.priceFromMinor, '9007199254740993');
  assert.equal(parameters.fuelType, 'PETROL,DIESEL');
  form.set('yearFrom', '2024');
  assert.throws(() => filterFormParameters(form, {}), /не больше/);
  assert.ok(validateSearch({ sort: 'price_asc' }));
  assert.ok(validateSearch({ sort: 'distance' }));
  assert.equal(validateSearch({ lat: '0', lng: '0', sort: 'distance' }), null);
});
test('central anonymous transport accepts decimal coordinates and opaque cursors, rejects path traversal', async () => {
  const paths: string[] = [];
  const client = new AuthClient(async (path, init) => {
    paths.push(path);
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    return Response.json({
      items: [],
      page: { hasNextPage: false, nextCursor: null },
    });
  });
  await new SearchClient(client).listings(
    'VEHICLE',
    { lat: '52.123', lng: '4.456', sort: 'distance' },
    '1.opaque',
  );
  assert.ok(paths[0]?.includes('lat=52.123'));
  assert.ok(paths[0]?.includes('cursor=1.opaque'));
  await assert.rejects(() => client.api('../private'), AuthApiError);
  await assert.rejects(() => client.api('%2e%2e/private'), AuthApiError);
});
test('search parser strips private fields and rejects precise distance/oversized result', () => {
  const serialized = JSON.stringify(page());
  for (const value of [
    'private@example.test',
    'private-source',
    'exactPoint',
    'vin',
    'version',
  ])
    assert.ok(!serialized.includes(value));
  assert.equal(page().items[0]?.location?.publicPoint, null);
  assert.throws(() =>
    parseSearchPage({
      items: [
        {
          ...rawItem,
          location: { ...rawItem.location, distanceMeters: 123.42 },
        },
      ],
      page: { hasNextPage: false, nextCursor: null },
    }),
  );
  assert.throws(() =>
    parseSearchPage({
      items: Array.from({ length: 51 }, () => rawItem),
      page: { hasNextPage: false, nextCursor: null },
    }),
  );
});
test('facets use a separate central request and enforce after-all-filters/bounded counts', async () => {
  const paths: string[] = [];
  const api = new SearchClient(
    new AuthClient(async (path) => {
      paths.push(path);
      return Response.json({
        type: 'VEHICLE',
        facets: {
          make: [{ value: id, count: 2 }],
          bodyType: [{ value: 'SEDAN', count: 2 }],
          fuelType: [{ value: 'PETROL', count: 2 }],
          transmission: [{ value: 'AUTOMATIC', count: 2 }],
        },
        truncated: false,
        semantics: 'after_all_filters',
      });
    }),
  );
  const result = await api.facets('VEHICLE', { currency: 'EUR' });
  assert.deepEqual(paths, [
    '/api/v1/search/listings/facets?type=VEHICLE&currency=EUR',
  ]);
  assert.equal(result.facets.bodyType?.[0]?.count, 2);
  const invalid = new SearchClient(
    new AuthClient(async () =>
      Response.json({
        type: 'VEHICLE',
        facets: {
          make: [],
          bodyType: Array.from({ length: 101 }, () => ({
            value: 'SEDAN',
            count: 1,
          })),
          fuelType: [],
          transmission: [],
        },
        truncated: false,
        semantics: 'after_all_filters',
      }),
    ),
  );
  await assert.rejects(() => invalid.facets('VEHICLE', {}), AuthApiError);
});
test('cursor Load more appends, query change aborts old requests and stale completion is ignored', async () => {
  const calls: {
    query: Record<string, string>;
    cursor: string | undefined;
    signal: AbortSignal;
    resolve: (value: SearchPage) => void;
  }[] = [];
  const session = new SearchSession(
    (query, cursor, signal) =>
      new Promise((resolve) => calls.push({ query, cursor, signal, resolve })),
  );
  const old = session.reset('old', { yearFrom: '2020' });
  const current = session.reset('new', { yearFrom: '2022' });
  assert.equal(calls[0]?.signal.aborted, true);
  calls[1]?.resolve(page('next'));
  await current;
  calls[0]?.resolve(page(null, '60000000-0000-4000-8000-000000000099'));
  await old;
  assert.deepEqual(
    session.snapshot().items.map((item) => item.id),
    [id],
  );
  const more = session.loadMore();
  assert.equal(calls[2]?.cursor, 'next');
  calls[2]?.resolve(page(null, '60000000-0000-4000-8000-000000000002'));
  await more;
  assert.equal(session.snapshot().items.length, 2);
  const restart = session.reset('other', {});
  assert.equal(session.snapshot().items.length, 0);
  assert.equal(calls[3]?.cursor, undefined);
  session.dispose();
  assert.equal(calls[3]?.signal.aborted, true);
  calls[3]?.resolve(page());
  await restart;
  assert.equal(session.snapshot().items.length, 0);
});
test('near-me permission is explicit; denial is normal feedback and no origin is persisted', async () => {
  let calls = 0;
  const geo = {
    getCurrentPosition: (
      _success: (value: {
        coords: { latitude: number; longitude: number };
      }) => void,
      error: (value: { code: number }) => void,
    ) => {
      calls++;
      error({ code: 1 });
    },
  };
  assert.equal(calls, 0);
  await assert.rejects(() => requestSearchOrigin(geo), /отклонён/);
  assert.equal(calls, 1);
  await assert.rejects(() => requestSearchOrigin(undefined), /вручную/);
  const origin = await requestSearchOrigin({
    getCurrentPosition: (success) =>
      success({ coords: { latitude: 52.123456789, longitude: 4.123456789 } }),
  });
  assert.deepEqual(origin, { lat: '52.123457', lng: '4.123457' });
});
test('distance, empty/loading/error/card rendering is accessible and has no false precision', () => {
  assert.equal(formatSearchDistance(0), '< 1 км');
  assert.equal(formatSearchDistance(12000), '12 км');
  assert.equal(formatSearchDistance(null), null);
  const empty = renderToStaticMarkup(
    createElement(SearchResults, {
      state: {
        key: '',
        items: [],
        nextCursor: null,
        loading: false,
        error: null,
      },
      onReset: () => {},
    }),
  );
  assert.ok(empty.includes('По вашему запросу ничего не найдено'));
  assert.ok(empty.includes('Сбросить фильтры'));
  const loading = renderToStaticMarkup(
    createElement(SearchResults, {
      state: {
        key: '',
        items: [],
        nextCursor: null,
        loading: true,
        error: null,
      },
      onReset: () => {},
    }),
  );
  assert.ok(loading.includes('role="status"'));
  const card = renderToStaticMarkup(
    createElement(
      AuthProvider,
      null,
      createElement(
        FavoriteProvider,
        null,
        createElement(SearchResults, {
          state: {
            key: '',
            items: page().items,
            nextCursor: null,
            loading: false,
            error: null,
          },
          onReset: () => {},
        }),
      ),
    ),
  );
  assert.ok(card.includes('&lt;script&gt;'));
  assert.ok(card.includes('/listings/' + id));
  assert.ok(card.includes('&lt; 1 км'));
});
test('filter form renders optional catalog, explicit Apply, origin-gated distance sort and currency fields', () => {
  const api = new ListingApi(new AuthClient());
  const html = renderToStaticMarkup(
    createElement(SearchFilters, { api, parameters: {}, onApply: () => {} }),
  );
  assert.ok(html.includes('Применить фильтры'));
  assert.ok(html.includes('Рядом со мной'));
  assert.ok(!html.includes('value="distance"'));
  const located = renderToStaticMarkup(
    createElement(SearchFilters, {
      api,
      parameters: { lat: '0', lng: '0' },
      onApply: () => {},
    }),
  );
  assert.ok(located.includes('value="distance"'));
});

const rawMapListing = {
  kind: 'LISTING',
  type: 'VEHICLE',
  listingId: id,
  title: '<b>safe text</b>',
  publicPoint: { latitude: 52, longitude: 4 },
  price: { amountMinor: '10000', currency: 'EUR' },
  cover: {
    url: 'https://processed.example.test/thumbnail.webp',
    width: 320,
    height: 240,
  },
  location: {
    city: 'City',
    region: null,
    countryCode: 'NL',
    distanceMeters: 1000,
    exactPoint: { latitude: 52.123456, longitude: 4.123456 },
  },
  vehicle: { make: 'BMW', model: '3 Series', year: 2022, mileageKm: 10000 },
};

test('map response parser validates discriminated bounded features and drops private fields', () => {
  const response = parseMapResponse({
    features: [
      rawMapListing,
      {
        kind: 'CLUSTER',
        clusterId: '4:10:12',
        center: { latitude: 52, longitude: 4 },
        count: 42,
        bounds: { west: 3, south: 51, east: 5, north: 53 },
      },
    ],
    truncated: false,
    limit: 500,
  });
  assert.equal(response.features[0]?.kind, 'LISTING');
  assert.ok(!JSON.stringify(response).includes('exactPoint'));
  assert.throws(() =>
    parseMapResponse({
      features: [
        {
          kind: 'CLUSTER',
          clusterId: 'bad',
          center: { latitude: 0, longitude: 0 },
          count: 1,
          bounds: { west: 0, south: 0, east: 1, north: 1 },
        },
      ],
      truncated: false,
      limit: 500,
    }),
  );
});

test('map URL state is coarse, filter-independent and search-area promotion replaces radius', () => {
  const input = new URLSearchParams(
    'view=map&mapLat=52.1234&mapLng=4.5678&mapZoom=8.25&fuelType=PETROL',
  );
  assert.deepEqual(parseMapUrlState(input), {
    view: 'map',
    camera: { latitude: 52.1234, longitude: 4.5678, zoom: 8.25 },
  });
  assert.equal(searchOnlyParameters(input).has('mapLat'), false);
  assert.equal(searchOnlyParameters(input).get('fuelType'), 'PETROL');
  const area = searchInArea(
    {
      lat: '52.123456',
      lng: '4.123456',
      radiusMeters: '50000',
      sort: 'distance',
    },
    { west: 179, south: -10, east: -179, north: 10 },
  );
  assert.equal(area.bbox, '179,-10,-179,10');
  assert.equal(area.lat, undefined);
  assert.equal(area.sort, 'newest');
  const privateUrl = catalogUrl(
    '/cars',
    { fuelType: 'PETROL' },
    {
      view: 'map',
      camera: { latitude: 52.123456, longitude: 4.123456, zoom: 12 },
    },
    false,
  );
  assert.equal(privateUrl.includes('52.123456'), false);
  assert.equal(privateUrl.includes('mapLat'), false);
  assert.equal(
    boundsParameter({ west: -0, south: 1, east: 2, north: 3 }),
    '0,1,2,3',
  );
});

test('map session aborts stale viewport requests and keeps prior markers on error', async () => {
  const calls: {
    key: string;
    signal: AbortSignal;
    resolve: (value: ReturnType<typeof parseMapResponse>) => void;
    reject: (error: Error) => void;
  }[] = [];
  const session = new MapSession(
    (key, signal) =>
      new Promise((resolve, reject) =>
        calls.push({ key, signal, resolve, reject }),
      ),
    0,
  );
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  session.schedule('a');
  await tick();
  session.schedule('b');
  await tick();
  assert.equal(calls[0]?.signal.aborted, true);
  calls[1]?.resolve(
    parseMapResponse({
      features: [rawMapListing],
      truncated: false,
      limit: 500,
    }),
  );
  await tick();
  assert.equal(session.snapshot().features.length, 1);
  calls[0]?.resolve(
    parseMapResponse({ features: [], truncated: false, limit: 500 }),
  );
  await tick();
  assert.equal(session.snapshot().features.length, 1);
  session.schedule('c');
  await tick();
  calls[2]?.reject(new Error('provider'));
  await tick();
  assert.equal(session.snapshot().features.length, 1);
  assert.ok(session.snapshot().error);
  session.dispose();
});

test('map provider configuration has an explicit fallback when style is absent', () => {
  const previous = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  try {
    delete process.env.NEXT_PUBLIC_MAP_STYLE_URL;
    assert.equal(publicMapConfig().styleUrl, null);
    process.env.NEXT_PUBLIC_MAP_STYLE_URL =
      'https://tiles.example.test/style.json';
    assert.equal(
      publicMapConfig().styleUrl,
      'https://tiles.example.test/style.json',
    );
    process.env.NEXT_PUBLIC_MAP_STYLE_URL = 'javascript:alert(1)';
    assert.equal(publicMapConfig().styleUrl, null);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_MAP_STYLE_URL;
    else process.env.NEXT_PUBLIC_MAP_STYLE_URL = previous;
  }
});
