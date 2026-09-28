import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { DatabaseConnection } from '../database/database.connection';
import { MetricsRegistry } from './metrics.registry';

@Controller({ path: 'internal/metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
  ) {}

  @Get()
  async read(@Res() response: Response): Promise<void> {
    if (!this.config.observability.metricsEnabled)
      throw new NotFoundException();
    const [queues, media] = await Promise.all([
      this.database.source.query<
        Array<{
          queue: string;
          pending: number;
          retry: number;
          failed: number;
          oldestPendingSeconds: number | null;
        }>
      >(`SELECT 'outbox' AS queue,
                count(*) FILTER (WHERE status='PENDING')::integer AS pending,
                count(*) FILTER (WHERE status='RETRY')::integer AS retry,
                count(*) FILTER (WHERE status='FAILED')::integer AS failed,
                COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - min(created_at)
                  FILTER (WHERE status IN ('PENDING','RETRY'))))::integer,0) AS "oldestPendingSeconds"
           FROM outbox_events
          UNION ALL
         SELECT 'delivery' AS queue,
                count(*) FILTER (WHERE status='PENDING')::integer,
                count(*) FILTER (WHERE status='RETRY')::integer,
                count(*) FILTER (WHERE status='FAILED')::integer,
                COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - min(created_at)
                  FILTER (WHERE status IN ('PENDING','RETRY'))))::integer,0)
           FROM notification_deliveries`),
      this.database.source.query<Array<{ status: string; count: number }>>(
        `SELECT status, count(*)::integer AS count FROM listing_media
         WHERE status IN ('PROCESSING','FAILED') GROUP BY status`,
      ),
    ]);
    const queue = (name: string) => {
      const row = queues.find((candidate) => candidate.queue === name);
      return {
        pending: Number(row?.pending ?? 0),
        retry: Number(row?.retry ?? 0),
        failed: Number(row?.failed ?? 0),
        oldestPendingSeconds: Number(row?.oldestPendingSeconds ?? 0),
      };
    };
    response
      .set({
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
        'cache-control': 'no-store',
      })
      .send(
        this.metrics.render({
          database: this.database.poolStats(),
          outbox: queue('outbox'),
          delivery: queue('delivery'),
          media: {
            processing: Number(
              media.find((row) => row.status === 'PROCESSING')?.count ?? 0,
            ),
            failed: Number(
              media.find((row) => row.status === 'FAILED')?.count ?? 0,
            ),
          },
        }),
      );
  }
}
