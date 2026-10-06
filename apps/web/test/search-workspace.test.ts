import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  activeSearchFilters,
  publicSearchInput,
  removeSearchFilter,
  searchErrorMessage,
} from '../src/features/search/search-presentation';
import { partFilterFormParameters } from '../src/features/parts/part-filter-model';
import { viewportChanged, searchInArea } from '../src/features/map/map-state';
import { categoryOptions } from '../src/features/parts/part-search-filters';
import { SearchSession } from '../src/features/search/search-session';
import { MapSession } from '../src/features/map/map-session';
import { AuthApiError } from '../src/features/auth/auth-client';
import { vehicleResult } from './result-fixtures';

test('chips remove only the selected value and cascade catalog/currency/origin dependencies', () => {
  const filters = {
    makeId: 'make',
    modelId: 'model',
    generationId: 'generation',
    fuelType: 'DIESEL,PETROL',
    yearFrom: '2020',
  };
  assert.deepEqual(removeSearchFilter(filters, 'makeId'), {
    fuelType: 'DIESEL,PETROL',
    yearFrom: '2020',
  });
  assert.equal(
    removeSearchFilter(filters, 'fuelType', 'DIESEL').fuelType,
    'PETROL',
  );
  assert.equal(filters.fuelType, 'DIESEL,PETROL');
  assert.deepEqual(
    removeSearchFilter(
      {
        compatibleMakeId: 'a',
        compatibleModelId: 'b',
        compatibleGenerationId: 'c',
        condition: 'USED',
      },
      'compatibleModelId',
    ),
    { compatibleMakeId: 'a', condition: 'USED' },
  );
  assert.deepEqual(
    removeSearchFilter(
      {
        currency: 'EUR',
        priceFromMinor: '100',
        sort: 'price_desc',
        yearTo: '2024',
      },
      'currency',
    ),
    { yearTo: '2024' },
  );
  assert.deepEqual(
    removeSearchFilter(
      {
        lat: '52.123456',
        lng: '4.123456',
        sort: 'distance',
        radiusMeters: '50000',
      },
      'geo',
    ),
    {},
  );
});
test('chips humanize reference IDs, enums, exact money and never print origin coordinates', () => {
  const chips = activeSearchFilters(
    'VEHICLE',
    {
      makeId: 'id',
      fuelType: 'DIESEL,PETROL',
      priceFromMinor: '9007199254740993',
      currency: 'EUR',
      lat: '52.123456',
      lng: '4.123456',
    },
    new Map([['id', 'BMW']]),
    true,
  );
  const text = chips.map((chip) => chip.label).join(' ');
  assert.match(text, /BMW/);
  assert.match(text, /Дизель/);
  assert.match(text, /90071992547409.93/);
  assert.match(text, /Рядом со мной/);
  assert.doesNotMatch(text, /52.123456|4.123456|DIESEL/);
});
test('private Near Me separates URL state and area search removes distance context', () => {
  const origin = {
    lat: '52.123456',
    lng: '4.123456',
    radiusMeters: '50000',
    sort: 'distance',
    currency: 'EUR',
  };
  const safe = publicSearchInput(origin, true);
  assert.deepEqual(safe.filters, { currency: 'EUR' });
  assert.equal(safe.origin?.sort, 'distance');
  const area = searchInArea(origin, {
    west: 179,
    east: -179,
    south: -10,
    north: 10,
  });
  assert.equal(area.bbox, '179,-10,-179,10');
  assert.equal(area.sort, 'newest');
  assert.equal(area.lat, undefined);
});
test('viewport threshold ignores rounding and handles dateline and world spans', () => {
  const box = { west: 179, east: -179, south: -10, north: 10 };
  assert.equal(viewportChanged(box, { ...box, west: 179.00001 }), false);
  assert.equal(viewportChanged(box, { ...box, west: 179.1 }), true);
  assert.equal(viewportChanged(box, { ...box, west: -180, east: 180 }), true);
  assert.equal(
    viewportChanged({ ...box, west: 180 }, { ...box, west: -180 }),
    false,
  );
});
test('Parts form preserves big integer money, multi-values, hierarchy and compatible catalog', () => {
  const data = new FormData();
  data.set('currency', 'EUR');
  data.set('priceFrom', '90071992547409.93');
  data.append('condition', 'USED');
  data.append('condition', 'NEW');
  data.set('includeUniversal', 'on');
  const parsed = partFilterFormParameters(data, {
    compatibleMakeId: vehicleResult.id,
  });
  assert.equal(parsed.priceFromMinor, '9007199254740993');
  assert.equal(parsed.condition, 'NEW,USED');
  assert.equal(parsed.includeUniversal, 'true');
  assert.equal(parsed.compatibleMakeId, vehicleResult.id);
  data.set('priceTo', '1');
  assert.throws(() => partFilterFormParameters(data, {}), /не больше/);
  assert.deepEqual(
    categoryOptions([
      { id: 'a', name: 'Тормоза', parentId: null },
      { id: 'b', name: 'Колодки', parentId: 'a' },
    ]).map((row) => row.label),
    ['Тормоза', 'Тормоза / Колодки'],
  );
});
test('expired cursor refreshes exactly once; duplicates within and across pages are removed', async () => {
  let calls = 0;
  const session = new SearchSession(async (_filters, cursor) => {
    calls++;
    if (cursor) throw new AuthApiError(400, 'SEARCH_INVALID_CURSOR');
    return {
      items: [vehicleResult, vehicleResult],
      page: { nextCursor: 'opaque', hasNextPage: true },
    };
  });
  await session.reset('key', {});
  assert.equal(session.snapshot().items.length, 1);
  await session.loadMore();
  assert.equal(calls, 3);
  assert.equal(session.snapshot().items.length, 1);
  session.dispose();
});
test('map deduplicates identical viewport requests but allows explicit retry; safe rate-limit feedback', async () => {
  let calls = 0;
  const session = new MapSession(async () => {
    calls++;
    return { features: [], truncated: false, limit: 500 };
  }, 0);
  session.schedule('area');
  session.schedule('area');
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  session.retry();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 2);
  session.dispose();
  assert.match(
    searchErrorMessage(new AuthApiError(429, 'RATE_LIMITED')),
    /Подождите/,
  );
  assert.doesNotMatch(
    searchErrorMessage(new Error('SQL secret')),
    /SQL|secret/,
  );
});
