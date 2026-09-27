import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ApiException } from '../../src/platform/http/api-error';
import {
  assertEditable,
  nextSellerStatus,
} from '../../src/modules/listings/domain/listing-lifecycle';
import { LISTING_STATUSES } from '../../src/modules/listings';
import { assertListingPrice } from '../../src/modules/listings/domain/listing-price';
import { expectedListingVersion } from '../../src/modules/listings/http/listing-precondition';
import {
  CreateListingInput,
  UpdateListingInput,
} from '../../src/modules/listings/http/listing.dto';
import {
  mapOwnerListing,
  mapPublicListing,
  mapOwnerListingSummary,
  mapPublicListingSummary,
} from '../../src/modules/listings/application/listing-mapping';
import { Listing } from '../../src/modules/listings/infrastructure/persistence/listing.entity';
import { Vehicle } from '../../src/modules/vehicles/infrastructure/persistence/vehicle.entity';
import { VehicleModel } from '../../src/modules/vehicles/infrastructure/persistence/vehicle-model.entity';
import { VehicleMake } from '../../src/modules/vehicles/infrastructure/persistence/vehicle-make.entity';
import { ListingLocation } from '../../src/modules/geo/infrastructure/persistence/listing-location.entity';
import { geoPoint } from '../../src/modules/geo';

test('seller lifecycle exhaustively allows only reviewed transitions; archive repeat is idempotent', () => {
  for (const status of LISTING_STATUSES) {
    if (status === 'DRAFT' || status === 'REJECTED') {
      assertEditable(status);
      assert.equal(nextSellerStatus(status, 'submit'), 'PENDING_MODERATION');
    } else {
      assert.throws(
        () => assertEditable(status),
        (error: unknown) =>
          error instanceof ApiException &&
          error.code === 'LISTING_INVALID_STATE',
      );
      assert.throws(
        () => nextSellerStatus(status, 'submit'),
        (error: unknown) =>
          error instanceof ApiException &&
          error.code === 'LISTING_INVALID_STATE_TRANSITION',
      );
    }
    assert.equal(nextSellerStatus(status, 'archive'), 'ARCHIVED');
    if (status === 'PUBLISHED')
      assert.equal(nextSellerStatus(status, 'mark-sold'), 'SOLD');
    else
      assert.throws(() => nextSellerStatus(status, 'mark-sold'), ApiException);
  }
});
test('preconditions reject absent, weak, wildcard, unquoted, multiple and overflowing ETags', () => {
  assert.equal(expectedListingVersion('"42"'), 42);
  assert.throws(
    () => expectedListingVersion(undefined),
    (error: unknown) =>
      error instanceof ApiException && error.getStatus() === 428,
  );
  for (const value of [
    '1',
    'W/"1"',
    '*',
    '"0"',
    '"01"',
    '"1", "2"',
    '"2147483647"',
    null,
  ])
    assert.throws(() => expectedListingVersion(value), ApiException);
});
test('listing prices remain exact positive int64 and use a reviewed currency allowlist', () => {
  assertListingPrice('9007199254740993', 'EUR');
  assertListingPrice('9223372036854775807', 'JPY');
  for (const amount of ['0', '-1', '01', '1.0', '9223372036854775808'])
    assert.throws(() => assertListingPrice(amount, 'EUR'), ApiException);
  assert.throws(() => assertListingPrice('100', 'ZZZ'), ApiException);
});
test('public mapping explicitly excludes VIN, exact coordinates, keys, identity secrets and internal versions', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const make = Object.assign(new VehicleMake(), {
    id: 'make',
    name: 'BMW',
    secret: 'never-public',
  });
  const model = Object.assign(new VehicleModel(), {
    id: 'model',
    name: '3 Series',
    make,
  });
  const vehicle = {
    ...Object.assign(new Vehicle(), {
      id: 'vehicle',
      modelId: 'model',
      generationId: null,
      model,
      year: 2022,
      mileageKm: 12000,
      bodyType: 'SEDAN' as const,
      fuelType: 'PETROL' as const,
      transmission: 'AUTOMATIC' as const,
      driveType: 'RWD' as const,
      condition: 'USED' as const,
      color: null,
      vin: 'WBA8A9C50GK123456',
      enginePowerHp: null,
      engineDisplacementCc: null,
      storageKey: 'private-bucket/key',
    }),
    generation: null,
  };
  const listing = Object.assign(new Listing(), {
    id: 'listing',
    title: 'Example',
    description: '<script>text</script>',
    status: 'PUBLISHED' as const,
    priceMinor: '9007199254740993',
    currency: 'EUR',
    version: 17,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    soldAt: null,
    submittedAt: null,
    archivedAt: null,
    passwordHash: 'private-hash',
    storageKey: 'private-bucket/key',
  });
  const location: ListingLocation = Object.assign(new ListingLocation(), {
    city: 'Amsterdam',
    region: null,
    countryCode: 'NL',
    point: geoPoint(52.36761234, 4.90411234),
    publicPoint: null,
  });
  const publicDto = mapPublicListing(listing, vehicle, location, {
    id: '550e8400-e29b-41d4-a716-446655440001',
    displayName: 'Seller',
  });
  const serialized = JSON.stringify(publicDto);
  for (const privateValue of [
    'vin',
    'WBA8A9C50GK123456',
    '52.36761234',
    '4.90411234',
    'storageKey',
    'version',
    'private-hash',
    'never-public',
  ])
    assert.equal(serialized.includes(privateValue), false, privateValue);
  assert.equal(publicDto.location?.publicPoint, null);
  assert.equal(publicDto.price.amountMinor, '9007199254740993');
  assert.equal(
    'description' in
      mapPublicListingSummary(listing, vehicle, location, {
        id: '550e8400-e29b-41d4-a716-446655440001',
        displayName: 'Seller',
      }),
    false,
  );
  const summary = JSON.stringify(
    mapOwnerListingSummary(listing, vehicle, location),
  );
  for (const field of ['description', 'vin', 'exactPoint', '52.36761234'])
    assert.equal(summary.includes(field), false);
  const owner = mapOwnerListing(listing, vehicle, location);
  assert.equal(owner.vehicle.vin, vehicle.vin);
  assert.equal(owner.version, 17);
  assert.deepEqual(owner.location?.exactPoint, {
    latitude: 52.36761234,
    longitude: 4.90411234,
  });
  location.publicPoint = geoPoint(52.36, 4.9);
  assert.deepEqual(
    mapPublicListing(listing, vehicle, location, {
      id: '550e8400-e29b-41d4-a716-446655440001',
      displayName: 'Seller',
    }).location?.publicPoint,
    { latitude: 52.36, longitude: 4.9 },
  );
});
test('coordinate construction has longitude first and rejects nonfinite/out-of-range values', () => {
  assert.deepEqual(geoPoint(52.3676, 4.9041), {
    type: 'Point',
    coordinates: [4.9041, 52.3676],
  });
  for (const [lat, lon] of [
    [91, 0],
    [0, 181],
    [NaN, 0],
    [0, Infinity],
  ])
    assert.throws(() => geoPoint(lat ?? NaN, lon ?? NaN), ApiException);
});
test('partial fields distinguish omission from clearing; required nested fields cannot be nulled', () => {
  assert.equal(
    validateSync(
      plainToInstance(UpdateListingInput, {
        vehicle: { generationId: null, vin: null },
        listing: { description: null },
      }),
    ).length,
    0,
  );
  for (const input of [
    { vehicle: { modelId: null } },
    { vehicle: null },
    { listing: { title: null } },
    { listing: { price: null } },
    { location: { latitude: null } },
  ])
    assert.notEqual(
      validateSync(plainToInstance(UpdateListingInput, input)).length,
      0,
    );
  const draft = plainToInstance(CreateListingInput, {
    vehicle: {
      modelId: '20000000-0000-4000-8000-000000000001',
      year: 2022,
      mileageKm: 0,
      bodyType: 'SEDAN',
      fuelType: 'PETROL',
      transmission: 'MANUAL',
      driveType: 'FWD',
      condition: 'USED',
      vin: ' wba8a9c50gk123456 ',
    },
    listing: {
      title: '  Example  ',
      description: 'Line 1\r\nLine 2\tOK',
      price: { amountMinor: '100', currency: 'eur' },
    },
  });
  assert.equal(validateSync(draft).length, 0);
  assert.equal(draft.vehicle.vin, 'WBA8A9C50GK123456');
  assert.equal(draft.listing.title, 'Example');
  assert.equal(draft.listing.description, 'Line 1\nLine 2\tOK');
});
