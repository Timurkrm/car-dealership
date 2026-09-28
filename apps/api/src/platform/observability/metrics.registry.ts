import { Injectable } from '@nestjs/common';

const HTTP_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

interface HttpSeries {
  count: number;
  sumSeconds: number;
  buckets: number[];
}

@Injectable()
export class MetricsRegistry {
  private readonly http = new Map<string, HttpSeries>();
  private httpServerErrors = 0;
  private websocketConnections = 0;

  observeHttp(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const labels = `${method}|${route}|${Math.floor(statusCode / 100)}xx`;
    const series = this.http.get(labels) ?? {
      count: 0,
      sumSeconds: 0,
      buckets: HTTP_BUCKETS.map(() => 0),
    };
    const seconds = durationMs / 1000;
    series.count += 1;
    series.sumSeconds += seconds;
    HTTP_BUCKETS.forEach((bucket, index) => {
      if (seconds <= bucket)
        series.buckets[index] = (series.buckets[index] ?? 0) + 1;
    });
    this.http.set(labels, series);
    if (statusCode >= 500) this.httpServerErrors += 1;
  }

  websocketConnected(): void {
    this.websocketConnections += 1;
  }

  websocketDisconnected(): void {
    this.websocketConnections = Math.max(0, this.websocketConnections - 1);
  }

  render(input: {
    database: { total: number; idle: number; waiting: number };
    outbox: QueueMetrics;
    delivery: QueueMetrics;
    media: { processing: number; failed: number };
  }): string {
    const lines = [
      '# HELP marketplace_http_requests_total Completed HTTP requests.',
      '# TYPE marketplace_http_requests_total counter',
      '# HELP marketplace_http_request_duration_seconds HTTP request duration.',
      '# TYPE marketplace_http_request_duration_seconds histogram',
    ];
    for (const [key, series] of this.http) {
      const [method, route, statusClass] = key.split('|');
      const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_class="${escapeLabel(statusClass)}"`;
      lines.push(`marketplace_http_requests_total{${labels}} ${series.count}`);
      series.buckets.forEach((count, index) =>
        lines.push(
          `marketplace_http_request_duration_seconds_bucket{${labels},le="${HTTP_BUCKETS[index]}"} ${count}`,
        ),
      );
      lines.push(
        `marketplace_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${series.count}`,
        `marketplace_http_request_duration_seconds_sum{${labels}} ${series.sumSeconds}`,
        `marketplace_http_request_duration_seconds_count{${labels}} ${series.count}`,
      );
    }
    lines.push(
      '# HELP marketplace_http_5xx_total Completed HTTP 5xx responses.',
      '# TYPE marketplace_http_5xx_total counter',
      `marketplace_http_5xx_total ${this.httpServerErrors}`,
      '# HELP marketplace_db_pool_connections PostgreSQL pool connections.',
      '# TYPE marketplace_db_pool_connections gauge',
      `marketplace_db_pool_connections{state="active"} ${Math.max(0, input.database.total - input.database.idle)}`,
      `marketplace_db_pool_connections{state="idle"} ${input.database.idle}`,
      `marketplace_db_pool_connections{state="waiting"} ${input.database.waiting}`,
      '# HELP marketplace_websocket_connections Current authenticated WebSocket connections.',
      '# TYPE marketplace_websocket_connections gauge',
      `marketplace_websocket_connections ${this.websocketConnections}`,
      ...queueLines('outbox', input.outbox),
      ...queueLines('delivery', input.delivery),
      '# HELP marketplace_media_items Media rows by operational state.',
      '# TYPE marketplace_media_items gauge',
      `marketplace_media_items{state="processing"} ${input.media.processing}`,
      `marketplace_media_items{state="failed"} ${input.media.failed}`,
    );
    return `${lines.join('\n')}\n`;
  }
}

export interface QueueMetrics {
  pending: number;
  retry: number;
  failed: number;
  oldestPendingSeconds: number;
}

function queueLines(
  name: 'outbox' | 'delivery',
  value: QueueMetrics,
): string[] {
  return [
    `# HELP marketplace_${name}_items Durable ${name} rows by state.`,
    `# TYPE marketplace_${name}_items gauge`,
    `marketplace_${name}_items{state="pending"} ${value.pending}`,
    `marketplace_${name}_items{state="retry"} ${value.retry}`,
    `marketplace_${name}_items{state="failed"} ${value.failed}`,
    `# HELP marketplace_${name}_oldest_pending_seconds Age of the oldest pending or retry row.`,
    `# TYPE marketplace_${name}_oldest_pending_seconds gauge`,
    `marketplace_${name}_oldest_pending_seconds ${value.oldestPendingSeconds}`,
  ];
}

function escapeLabel(value = ''): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n');
}
