import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { performance } from 'node:perf_hooks';
import { APP_CONFIG } from '../../../../config/config';
import type { AppConfig } from '../../../../config/config';
import { StructuredLogger } from '../../../../platform/logging/structured-logger';
import { MediaProcessor } from '../../application/media-processor';
import { MediaCleanup } from '../../application/media-cleanup';
import { queueConnection, queueName } from './media-queue';
import type { MediaJob } from './media-queue';
@Injectable()
export class MediaWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<MediaJob>;
  private timer?: NodeJS.Timeout;
  private dispatching?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MediaProcessor) private readonly processor: MediaProcessor,
    @Inject(MediaCleanup) private readonly cleanup: MediaCleanup,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}
  async onModuleInit(): Promise<void> {
    this.worker = new Worker<MediaJob>(
      queueName(this.config),
      async (job) => {
        const started = performance.now();
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            job.data.mediaId,
          ) ||
          !['process', 'cleanup'].includes(job.name)
        )
          throw new Error('Invalid media job');
        this.logger.event('info', 'Media job started', {
          operation: 'media_job',
          jobId: job.id,
          entityId: job.data.mediaId,
          attempt: job.attemptsMade + 1,
        });
        try {
          if (job.name === 'process')
            await this.processor.process(job.data.mediaId);
          else await this.cleanup.cleanup(job.data.mediaId);
        } finally {
          const durationMs = Math.round(performance.now() - started);
          if (durationMs >= this.config.runtime.slowJobMs)
            this.logger.event('warn', 'Slow media job', {
              operation: 'media_job_slow',
              jobId: job.id,
              entityId: job.data.mediaId,
              durationMs,
            });
        }
      },
      {
        connection: queueConnection(this.config, true),
        concurrency: this.config.media.concurrency,
        maxStalledCount: 1,
      },
    );
    this.worker.on('error', () =>
      this.logger.event('warn', 'Media worker queue unavailable', {
        operation: 'media_worker',
      }),
    );
    this.worker.on('failed', (job) =>
      this.logger.event('warn', 'Media job attempt failed', {
        operation: 'media_job',
        jobId: job?.id,
        entityId: job?.data.mediaId,
        attempt: job?.attemptsMade,
      }),
    );
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.worker.waitUntilReady(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Media worker startup timed out')),
            5000,
          );
        }),
      ]);
    } catch (error) {
      await this.worker.close(true);
      throw new Error('Media worker startup unavailable', { cause: error });
    } finally {
      clearTimeout(timer);
    }
    this.timer = setInterval(() => this.dispatch(), 3000);
    this.dispatch();
  }
  private dispatch() {
    if (this.stopping || this.dispatching) return;
    this.dispatching = this.cleanup
      .dispatch()
      .catch(() => {
        this.logger.event('warn', 'Media dispatch unavailable', {
          operation: 'media_dispatch',
        });
      })
      .finally(() => {
        this.dispatching = undefined;
      });
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.dispatching;
    await this.worker?.close();
  }
}
