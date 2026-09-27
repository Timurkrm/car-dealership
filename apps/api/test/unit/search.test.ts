import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiException } from '../../src/platform/http/api-error';
import {
  parseSearchQuery,
  canonicalSearch,
  searchFingerprint,
} from '../../src/modules/search/domain/search-query';
import { SearchCursor } from '../../src/modules/search/domain/search-cursor';
import { sortDefinition } from '../../src/modules/search/infrastructure/listing-search-query';
import { parseSpatialSearch, publicDistance } from '../../src/modules/geo';
import { testConfig } from '../fixtures';
import { searchLocation } from '../../src/modules/search/application/listing-search';
import {
  mapGridCellMeters,
  parseMapQuery,
} from '../../src/modules/search/domain/map-query';

const query = parseSearchQuery({ currency: 'EUR', fuelType: 'DIESEL,PETROL' });
const position = {
  id: '60000000-0000-4000-8000-000000000001',
  publishedAt: '2026-01-01T00:00:00.123456Z',
  value: '2026-01-01T00:00:00.123456Z',
};
function rejects(input: object, code: string) {
  assert.throws(
    () => parseSearchQuery(input),
    (error: unknown) =>
      error instanceof ApiException &&
      error.code ===
        (code === 'SEARCH_INVALID_RANGE' ? 'VALIDATION_ERROR' : code),
  );
}
test('structured filter validation bounds categories, integers, money and currency', () => {
  for (const input of [
    { limit: '100000' },
    { fuelType: 'PETROL,PETROL' },
    { color: 'blue' },
    { yearFrom: '2020.5' },
    { mileageFrom: '-1' },
    { priceFromMinor: '9223372036854775808', currency: 'EUR' },
    { priceFromMinor: '001', currency: 'EUR' },
    { priceFromMinor: '1' },
    { currency: 'XYZ' },
    { fuelType: ['PETROL', 'DIESEL'] },
    { q: 'hello' },
    { makeId: "' OR 1=1 --" },
  ])
    rejects(input, 'SEARCH_INVALID_FILTER');
  rejects({ yearFrom: '2023', yearTo: '2020' }, 'SEARCH_INVALID_RANGE');
  rejects(
    {
      priceFromMinor: '9007199254740994',
      priceToMinor: '9007199254740993',
      currency: 'EUR',
    },
    'SEARCH_INVALID_RANGE',
  );
  assert.equal(
    parseSearchQuery({ priceFromMinor: '9007199254740993', currency: 'EUR' })
      .filters.priceFromMinor,
    '9007199254740993',
  );
});
test('canonical model and fingerprint normalize order and exclude pagination', () => {
  const next = parseSearchQuery({
    fuelType: 'PETROL,DIESEL',
    limit: '50',
    currency: 'EUR',
    cursor: 'opaque',
  });
  assert.equal(canonicalSearch(next), canonicalSearch(query));
  assert.equal(searchFingerprint(next), searchFingerprint(query));
  assert.notEqual(
    searchFingerprint(parseSearchQuery({ lat: '52', lng: '4' })),
    searchFingerprint(query),
  );
  assert.equal(JSON.parse(canonicalSearch(query)).schemaVersion, 2);
  assert.equal(query.type, 'VEHICLE');
  const geo = parseSearchQuery({ lat: '52', lng: '4', radiusMeters: '50000' });
  assert.equal(
    canonicalSearch(geo),
    canonicalSearch({
      ...geo,
      spatial: {
        radiusMeters: 50000,
        longitude: 4,
        latitude: 52,
        mode: 'origin',
      },
    }),
  );
});
test('multi-category schema validates subtype filters and binds type into cursors', () => {
  const part = parseSearchQuery({
    type: 'PART',
    condition: 'USED,NEW',
    partNumber: ' ab-12 ',
    compatibleModelId: '20000000-0000-4000-8000-000000000001',
    compatibleYear: '2020',
  });
  assert.equal(part.type, 'PART');
  if (part.type === 'PART') {
    assert.deepEqual(part.filters.condition, ['NEW', 'USED']);
    assert.equal(part.filters.partNumber, 'AB-12');
    assert.equal(part.filters.includeSubcategories, true);
    assert.equal(part.filters.includeUniversal, true);
  }
  rejects({ type: 'PART', fuelType: 'PETROL' }, 'SEARCH_FILTER_NOT_SUPPORTED');
  rejects(
    { type: 'VEHICLE', categoryId: position.id },
    'SEARCH_FILTER_NOT_SUPPORTED',
  );
  rejects({ type: 'PART', sort: 'mileage_asc' }, 'SEARCH_SORT_NOT_SUPPORTED');
  rejects(
    { type: 'PART', compatibleGenerationId: position.id },
    'SEARCH_INVALID_FILTER',
  );
  assert.notEqual(
    searchFingerprint(part),
    searchFingerprint(parseSearchQuery({})),
  );
  const cursor = new SearchCursor(testConfig());
  const encoded = cursor.encode(query, position);
  assert.throws(
    () => cursor.decode({ ...part, cursor: encoded }),
    (error: unknown) =>
      error instanceof ApiException &&
      error.code === 'SEARCH_CURSOR_QUERY_MISMATCH',
  );
});
test('encrypted cursors preserve microseconds, reject tampering, expiry, version and changed query', () => {
  const cursor = new SearchCursor(testConfig());
  const encoded = cursor.encode(query, position);
  assert.deepEqual(cursor.decode({ ...query, cursor: encoded }), position);
  assert.ok(
    !Buffer.from(encoded.slice(2), 'base64url')
      .toString('utf8')
      .includes(position.id),
  );
  assert.throws(() =>
    cursor.decode({ ...query, cursor: encoded.slice(0, -3) + 'abc' }),
  );
  assert.throws(() =>
    cursor.decode({
      ...query,
      cursor: cursor.encode(query, { ...position, id: 'a'.repeat(36) }),
    }),
  );
  const price = parseSearchQuery({ sort: 'price_asc', currency: 'EUR' });
  assert.deepEqual(
    cursor.decode({
      ...price,
      cursor: cursor.encode(price, { ...position, value: '9007199254740993' }),
    })?.value,
    '9007199254740993',
  );
  assert.throws(() =>
    cursor.decode({ ...query, cursor: '2.' + encoded.slice(2) }),
  );
  assert.throws(
    () =>
      cursor.decode({
        ...parseSearchQuery({ currency: 'USD' }),
        cursor: encoded,
      }),
    (error: unknown) =>
      error instanceof ApiException &&
      error.code === 'SEARCH_CURSOR_QUERY_MISMATCH',
  );
  const date = Date.now;
  try {
    Date.now = () => date() + 86400001;
    assert.throws(() => cursor.decode({ ...query, cursor: encoded }));
  } finally {
    Date.now = date;
  }
});
test('sorting is allowlisted and requires currency/origin', () => {
  rejects({ sort: 'price_asc' }, 'SEARCH_INVALID_FILTER');
  rejects({ sort: 'distance' }, 'SEARCH_LOCATION_REQUIRED');
  rejects({ sort: 'newest; DROP TABLE listings' }, 'SEARCH_INVALID_SORT');
  assert.equal(
    sortDefinition(parseSearchQuery({ sort: 'price_asc', currency: 'EUR' }))
      .direction,
    'ASC',
  );
  assert.equal(
    sortDefinition(parseSearchQuery({ sort: 'year_desc' })).direction,
    'DESC',
  );
  assert.ok(
    sortDefinition(
      parseSearchQuery({ sort: 'distance', lat: '0', lng: '0' }),
    ).column.includes('<->'),
  );
});
test('geo modes validate bounds, finite precision, radius and crossing antimeridian', () => {
  assert.deepEqual(parseSpatialSearch({ bbox: '179,-10,-179,10' }), {
    mode: 'bbox',
    west: 179,
    south: -10,
    east: -179,
    north: 10,
  });
  for (const input of [
    { bbox: '0,20,1,10' },
    { bbox: '181,0,1,10' },
    { bbox: '0,0,1' },
    { lat: 'NaN', lng: '0' },
    { lat: '90.1', lng: '0' },
    { lat: '0.123456789', lng: '0' },
    { lat: '0' },
    { lat: '0', lng: '0', radiusMeters: '250001' },
    { bbox: '0,0,1,1', lat: '0', lng: '0' },
  ])
    assert.throws(() => parseSpatialSearch(input));
  assert.equal(parseSpatialSearch({ bbox: '-180,-90,180,90' }).mode, 'bbox');
});
test('public distances disclose only kilometre buckets', () => {
  assert.equal(publicDistance(null), null);
  assert.equal(publicDistance(0), 0);
  assert.equal(publicDistance(999.99), 0);
  assert.equal(publicDistance(1400.5), 1000);
  assert.equal(publicDistance(1599.5), 2000);
  assert.throws(() => publicDistance(Infinity));
});
test('public location projection never falls back to injected private coordinates', () => {
  const row = {
    city: 'Example',
    region: null,
    countryCode: 'NL',
    publicLatitude: null,
    publicLongitude: null,
    distance: 123.45,
    exactPoint: { latitude: 52.1234567, longitude: 4.1234567 },
  };
  assert.equal(searchLocation(row)?.publicPoint, null);
  assert.ok(!JSON.stringify(searchLocation(row)).includes('52.1234567'));
  assert.deepEqual(
    searchLocation({ ...row, publicLatitude: 52, publicLongitude: 4 })
      ?.publicPoint,
    { latitude: 52, longitude: 4 },
  );
  assert.equal(searchLocation({ ...row, city: null, countryCode: null }), null);
});

test('map query separates display viewport from search geography and validates zoom', () => {
  const combined = parseMapQuery({
    type: 'PART',
    viewport: '179,-20,-179,20',
    lat: '52',
    lng: '4',
    radiusMeters: '2000',
    zoom: '8.75',
  });
  assert.equal(combined.search.spatial.mode, 'origin');
  assert.deepEqual(combined.viewport, {
    mode: 'bbox',
    west: 179,
    south: -20,
    east: -179,
    north: 20,
  });
  assert.equal(combined.zoomBucket, 8);
  assert.equal(combined.legacyBboxAlias, false);

  const legacy = parseMapQuery({ bbox: '-10,-10,10,10', limit: '1' });
  assert.equal(legacy.search.spatial.mode, 'none');
  assert.equal(legacy.legacyBboxAlias, true);
  assert.equal(legacy.limit, 1);
  assert.ok(mapGridCellMeters(5) > mapGridCellMeters(10));

  for (const input of [
    {},
    { viewport: '0,0,0,1' },
    { viewport: '0,1,1,1' },
    { viewport: '0,0,1,1', zoom: '22.1' },
    { viewport: '0,0,1,1', zoom: 'NaN' },
    { viewport: '0,0,1,1);DROP TABLE listings;--' },
    { viewport: '0,0,1,1', zoom: '1;DROP TABLE listings' },
    { bbox: '0,0,1,1', lat: '0', lng: '0' },
    { viewport: '0,0,1,1', cursor: 'opaque' },
    { viewport: '0,0,1,1', limit: '501' },
  ])
    assert.throws(() => parseMapQuery(input));
});
