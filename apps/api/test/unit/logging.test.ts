import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { StructuredLogger } from '../../src/platform/logging/structured-logger';
import { testConfig } from '../fixtures';

test('structured logs carry context and omit arbitrary framework objects and error stacks', (context) => {
  const output: string[] = [];
  context.mock.method(process.stdout, 'write', (value: string) => {
    output.push(value);
    return true;
  });
  const logger = new StructuredLogger({ ...testConfig(), logLevel: 'info' });
  logger.event('info', 'Request completed', {
    requestId: 'request_123456',
    operation: 'http_get',
  });
  logger.log({ password: 'do-not-log-me', authorization: 'do-not-log-me' });
  logger.error('do-not-log-me', 'do-not-log-me');
  assert.equal(output.length, 3);
  const record: unknown = JSON.parse(output[0] ?? '');
  assert.ok(
    typeof record === 'object' &&
      record !== null &&
      'requestId' in record &&
      record.requestId === 'request_123456',
  );
  assert.ok(output.every((line) => !line.includes('do-not-log-me')));
});
