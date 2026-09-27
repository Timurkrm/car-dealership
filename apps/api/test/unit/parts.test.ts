import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  normalizePartNumber,
  validateFitment,
  validateCategoryParent,
} from '../../src/modules/parts/domain/part.types';
import {
  CreatePartListingInput,
  UpdatePartListingInput,
} from '../../src/modules/listings/http/part-listing.dto';
const modelId = '20000000-0000-4000-8000-000000000001';
test('part numbers normalize case and outer spaces while retaining meaningful separators', () => {
  assert.equal(normalizePartNumber(' ab-12 / 3 '), 'AB-12 / 3');
  assert.notEqual(normalizePartNumber('AB-12'), normalizePartNumber('AB12'));
  assert.equal(normalizePartNumber(null), null);
  assert.equal(normalizePartNumber(undefined), null);
  for (const input of ['', ' ', 'A\nB', '<script>', 'a'.repeat(101)])
    assert.throws(() => normalizePartNumber(input));
});
test('fitment supports universal, draft incomplete and multiple model scopes, rejecting invalid bounds and duplicate null selections', () => {
  validateFitment({ mode: 'UNIVERSAL', vehicles: [] });
  validateFitment({ mode: 'VEHICLE_SPECIFIC', vehicles: [] });
  validateFitment({
    mode: 'VEHICLE_SPECIFIC',
    vehicles: [
      { modelId },
      { modelId, generationId: modelId, yearFrom: 2000, yearTo: 2020 },
    ],
  });
  for (const vehicles of [
    [{ modelId, yearFrom: 2021, yearTo: 2020 }],
    [{ modelId, yearFrom: 1885 }],
    [{ modelId, yearTo: Infinity }],
    [
      { modelId },
      { modelId, generationId: null, yearFrom: null, yearTo: null },
    ],
    Array.from({ length: 51 }, () => ({ modelId })),
  ])
    assert.throws(() =>
      validateFitment({ mode: 'VEHICLE_SPECIFIC', vehicles }),
    );
  assert.throws(() =>
    validateFitment({ mode: 'UNIVERSAL', vehicles: [{ modelId }] }),
  );
  assert.throws(() =>
    validateFitment({
      mode: 'VEHICLE_SPECIFIC',
      vehicles: [
        { modelId: 'abcdef00-0000-4000-8000-000000000001' },
        { modelId: 'ABCDEF00-0000-4000-8000-000000000001' },
      ],
    }),
  );
});
test('category hierarchy rejects self, transitive cycles and unknown parents', () => {
  const parents = new Map([
    ['a', null],
    ['b', 'a'],
    ['c', 'b'],
  ]);
  validateCategoryParent('d', 'c', parents);
  for (const parent of ['a', 'c', 'missing'])
    assert.throws(() => validateCategoryParent('a', parent, parents));
});
test('part transport rejects null required fields, subtype confusion and quantity bounds', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  const valid = {
    part: {
      categoryId: modelId,
      name: 'Brake pads',
      condition: 'NEW',
      fitment: { mode: 'UNIVERSAL', vehicles: [] },
    },
    listing: { title: 'Pads', price: { amountMinor: '100', currency: 'EUR' } },
  };
  assert.deepEqual(
    validateSync(plainToInstance(CreatePartListingInput, valid), options),
    [],
  );
  for (const patch of [
    { part: null },
    { part: { name: null } },
    { quantityAvailable: 0 },
    { quantityAvailable: 1000001 },
    { vehicle: { modelId } },
  ])
    assert.ok(
      validateSync(plainToInstance(UpdatePartListingInput, patch), options)
        .length,
    );
});
