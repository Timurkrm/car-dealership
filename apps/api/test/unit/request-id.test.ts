import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveRequestId } from '../../src/platform/http/request-context';

test('accepts a bounded safe correlation ID', () =>
  assert.equal(resolveRequestId('request_123456'), 'request_123456'));
test('replaces missing, multiline, array and oversized request IDs with UUIDs', () => {
  for (const value of [
    undefined,
    'short',
    'header\r\ninjection',
    ['request_123456'],
    'x'.repeat(65),
  ])
    assert.match(resolveRequestId(value), /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
});
