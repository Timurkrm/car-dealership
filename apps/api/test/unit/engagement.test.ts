import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiException } from '../../src/platform/http/api-error';
import {
  hasMeaningfulSavedSearchFilter,
  parseSavedSearchFilters,
} from '../../src/modules/search';
import {
  matchesSavedSearch,
  type ListingMatchingSnapshot,
} from '../../src/modules/search/application/saved-search-matcher';
import { notificationPayload } from '../../src/modules/notifications';

const ids = {
  make: '10000000-0000-4000-8000-000000000001',
  model: '20000000-0000-4000-8000-000000000001',
  generation: '30000000-0000-4000-8000-000000000001',
  category: '40000000-0000-4000-8000-000000000001',
  child: '40000000-0000-4000-8000-000000000002',
  brand: '50000000-0000-4000-8000-000000000001',
  listing: '60000000-0000-4000-8000-000000000001',
  seller: '70000000-0000-4000-8000-000000000001',
};

const common = {
  id: ids.listing,
  title: 'Listing',
  priceMinor: '2500000',
  currency: 'EUR',
  publishedAt: '2026-09-01T00:00:00.000000Z',
  city: 'Amsterdam',
  region: null,
  countryCode: 'NL',
  publicLatitude: null,
  publicLongitude: null,
  exactLatitude: 52.36,
  exactLongitude: 4.9,
  distance: null,
  thumbnailKey: 'safe-key',
  thumbnailWidth: 320,
  thumbnailHeight: 240,
  sellerId: ids.seller,
};

const vehicle: ListingMatchingSnapshot = {
  ...common,
  type: 'VEHICLE',
  makeId: ids.make,
  makeName: 'Make',
  modelId: ids.model,
  modelName: 'Model',
  generationId: ids.generation,
  generationName: 'Generation',
  year: 2022,
  mileageKm: 12000,
  bodyType: 'SEDAN',
  fuelType: 'PETROL',
  transmission: 'AUTOMATIC',
  driveType: 'RWD',
  condition: 'USED',
  color: 'BLUE',
};

const part: ListingMatchingSnapshot = {
  ...common,
  type: 'PART',
  partId: '80000000-0000-4000-8000-000000000001',
  partName: 'Brake pads',
  partCategoryId: ids.child,
  partCategoryName: 'Pads',
  partCategoryParentId: ids.category,
  categoryAncestorIds: [ids.child, ids.category],
  partBrandId: ids.brand,
  partBrandName: 'Brand',
  partCondition: 'NEW',
  manufacturerPartNumber: 'AB-12',
  oemNumber: 'OE-10',
  fitmentMode: 'VEHICLE_SPECIFIC',
  fitmentCount: 1,
  quantityAvailable: 2,
  fitments: [
    {
      make: { id: ids.make, name: 'Make' },
      model: { id: ids.model, name: 'Model' },
      generation: null,
      modelId: ids.model,
      generationId: null,
      yearFrom: 2020,
      yearTo: 2024,
    },
  ],
};

test('saved searches canonicalize multi-values and reject transient private origin', () => {
  const left = parseSavedSearchFilters('VEHICLE', {
    fuelType: 'PETROL,DIESEL',
    makeId: ids.make,
  });
  const right = parseSavedSearchFilters('VEHICLE', {
    makeId: ids.make,
    fuelType: 'DIESEL,PETROL',
  });
  assert.equal(left.fingerprint, right.fingerprint);
  assert.deepEqual(left.filters, {
    fuelType: 'DIESEL,PETROL',
    makeId: ids.make,
  });
  assert.equal(hasMeaningfulSavedSearchFilter(left.filters), true);
  assert.throws(
    () => parseSavedSearchFilters('VEHICLE', { lat: '52', lng: '4' }),
    (error: unknown) =>
      error instanceof ApiException &&
      error.code === 'SAVED_SEARCH_LOCATION_NOT_SAVABLE',
  );
  assert.throws(() => parseSavedSearchFilters('PART', { fuelType: 'PETROL' }));
});

test('vehicle matcher preserves structured, money and antimeridian bbox semantics', () => {
  const matching = parseSavedSearchFilters('VEHICLE', {
    makeId: ids.make,
    modelId: ids.model,
    yearFrom: '2020',
    mileageTo: '15000',
    fuelType: 'PETROL',
    priceToMinor: '3000000',
    currency: 'EUR',
    bbox: '4,52,5,53',
  });
  assert.equal(matchesSavedSearch(matching.query, vehicle), true);
  const crossing = parseSavedSearchFilters('VEHICLE', {
    bbox: '179,-10,-179,10',
  });
  assert.equal(
    matchesSavedSearch(crossing.query, {
      ...vehicle,
      exactLatitude: 0,
      exactLongitude: -179.5,
    }),
    true,
  );
  assert.equal(
    matchesSavedSearch(
      parseSavedSearchFilters('VEHICLE', { currency: 'USD' }).query,
      vehicle,
    ),
    false,
  );
});

test('part matcher preserves subtree, exact numbers, fitment year and universal policy', () => {
  const matching = parseSavedSearchFilters('PART', {
    categoryId: ids.category,
    brandId: ids.brand,
    condition: 'NEW',
    manufacturerPartNumber: 'ab-12',
    compatibleMakeId: ids.make,
    compatibleModelId: ids.model,
    compatibleGenerationId: ids.generation,
    compatibleYear: '2022',
  });
  assert.equal(matchesSavedSearch(matching.query, part), true);
  assert.equal(
    matchesSavedSearch(
      parseSavedSearchFilters('PART', {
        categoryId: ids.category,
        includeSubcategories: 'false',
      }).query,
      part,
    ),
    false,
  );
  const universal = {
    ...part,
    fitmentMode: 'UNIVERSAL',
    fitments: [],
  } as const;
  assert.equal(
    matchesSavedSearch(
      parseSavedSearchFilters('PART', {
        compatibleModelId: ids.model,
        includeUniversal: 'true',
      }).query,
      universal,
    ),
    true,
  );
  assert.equal(
    matchesSavedSearch(
      parseSavedSearchFilters('PART', {
        compatibleModelId: ids.model,
        includeUniversal: 'false',
      }).query,
      universal,
    ),
    false,
  );
});

test('notification payloads are versioned and type validated', () => {
  assert.deepEqual(
    notificationPayload('SAVED_SEARCH_MATCH', {
      listingId: ids.listing,
      listingType: 'VEHICLE',
    }),
    {
      schemaVersion: 1,
      listingId: ids.listing,
      listingType: 'VEHICLE',
    },
  );
  assert.throws(() =>
    notificationPayload('FAVORITE_LISTING_STATUS_CHANGED', {
      listingId: ids.listing,
      listingType: 'VEHICLE',
      status: 'INTERNAL_REASON',
    }),
  );
  assert.throws(() =>
    notificationPayload('SAVED_SEARCH_MATCH', {
      listingId: ids.listing,
      listingType: 'VEHICLE',
      exactLatitude: 52.123456,
    }),
  );
  assert.throws(() =>
    notificationPayload('NEW_MESSAGE', { conversationId: ids.listing }),
  );
});
