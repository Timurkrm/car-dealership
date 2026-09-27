import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeEmail } from '../../src/modules/users';
import { normalizeVin } from '../../src/modules/vehicles';
import { validatePrice } from '../../src/modules/listings/domain/listing.types';
import { validateAuditMetadata } from '../../src/modules/audit/domain/audit.types';

test('canonical identifiers normalize consistently without duplicating stored formats', () => {
  assert.equal(normalizeEmail(' Seller@Example.Test '), 'seller@example.test');
  assert.equal(normalizeVin(' wba8a9c50gk123456 '), 'WBA8A9C50GK123456');
});

test('money validates exact int64 strings, including values above Number safe precision', () => {
  for (const value of ['0', '9007199254740993', '9223372036854775807'])
    validatePrice(value, 'EUR');
  for (const value of ['-1', '1.2', '1e4', '01', '9223372036854775808', ''])
    assert.throws(() => validatePrice(value, 'EUR'), RangeError);
  for (const currency of ['eur', 'EU', 'EURO', '€€€'])
    assert.throws(() => validatePrice('1', currency), RangeError);
});

test('audit writer metadata boundary rejects arbitrary sensitive payloads and free text', () => {
  validateAuditMetadata({
    changedFields: ['status', 'priceMinor'],
    previousStatus: 'DRAFT',
    nextStatus: 'PUBLISHED',
    reasonCode: 'MANUAL_REVIEW',
  });
  const unexpected = {
    reasonCode: 'LOGIN',
    password: 'must-never-be-persisted',
  };
  assert.throws(() => validateAuditMetadata(unexpected), /Unexpected/);
  assert.throws(
    () => validateAuditMetadata({ reasonCode: 'person@example.test' }),
    /machine codes/,
  );
  assert.throws(
    () => validateAuditMetadata({ changedFields: ['authorization.header'] }),
    /field list/,
  );
});
