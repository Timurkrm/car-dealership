import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MetricsRegistry } from '../../src/platform/observability/metrics.registry';

test('metrics use bounded labels and valid single metadata declarations', () => {
  const registry = new MetricsRegistry();
  registry.observeHttp('GET', '/api/v1/listings', 200, 25);
  registry.observeHttp('GET', '/api/v1/listings', 503, 250);
  registry.websocketConnected();
  const output = registry.render({
    database: { total: 4, idle: 1, waiting: 2 },
    outbox: { pending: 3, retry: 1, failed: 0, oldestPendingSeconds: 10 },
    delivery: { pending: 2, retry: 0, failed: 1, oldestPendingSeconds: 20 },
    media: { processing: 2, failed: 1 },
  });

  assert.equal(
    output.match(
      /# HELP marketplace_http_request_duration_seconds HTTP request duration\./g,
    )?.length,
    1,
  );
  assert.match(
    output,
    /marketplace_http_requests_total\{method="GET",route="\/api\/v1\/listings",status_class="2xx"\} 1/,
  );
  assert.match(output, /marketplace_http_5xx_total 1/);
  assert.match(output, /marketplace_db_pool_connections\{state="active"\} 3/);
  assert.match(output, /marketplace_websocket_connections 1/);
});
