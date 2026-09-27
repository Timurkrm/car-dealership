import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HealthService } from '../../src/health/health.service';
import { ProcessLifecycle } from '../../src/platform/runtime/process-lifecycle';

test('readiness requires writable PostgreSQL and treats Redis as degradable', async () => {
  const lifecycle = new ProcessLifecycle();
  const service = new HealthService(
    { check: async () => {} },
    {
      check: async () => {
        throw new Error('redis unavailable');
      },
    },
    { event: () => {} },
    lifecycle,
  );
  assert.deepEqual(await service.ready(), { status: 'ok' });
  lifecycle.beginShutdown();
  assert.deepEqual(await service.ready(), { status: 'unavailable' });
});
test('readiness reports dependency failure without infrastructure error details', async () => {
  const service = new HealthService(
    {
      check: async () => {
        throw new Error('private SQL and credentials');
      },
    },
    { check: async () => {} },
    { event: () => {} },
    new ProcessLifecycle(),
  );
  assert.deepEqual(await service.ready(), { status: 'unavailable' });
});
