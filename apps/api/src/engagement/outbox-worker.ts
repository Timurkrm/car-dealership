import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { APP_CONFIG } from '../config/config';
import type { AppConfig } from '../config/config';
import { StructuredLogger } from '../platform/logging/structured-logger';
import { OutboxRecords } from '../modules/outbox';
import type { OutboxDomainEvent } from '../modules/outbox';
import { OutboxEventProcessor } from './outbox-event-processor';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(OutboxRecords) private readonly outbox: OutboxRecords,
    @Inject(OutboxEventProcessor)
    private readonly processor: OutboxEventProcessor,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.dispatch(), 2000);
    this.dispatch();
  }

  async runOnce(): Promise<void> {
    const events = await this.outbox.claim();
    for (const event of events) await this.handle(event);
  }

  private dispatch(): void {
    if (this.stopping || this.running) return;
    this.running = this.runOnce()
      .catch(() =>
        this.logger.event('warn', 'Outbox polling failed', {
          operation: 'outbox_poll',
        }),
      )
      .finally(() => {
        this.running = undefined;
      });
  }

  private async handle(event: OutboxDomainEvent): Promise<void> {
    const started = performance.now();
    try {
      await this.processor.process(event);
    } catch (error) {
      const code = safeErrorCode(error);
      await this.outbox.fail(event, code);
      this.logger.event('warn', 'Outbox event attempt failed', {
        operation: 'outbox_process',
        entityId: event.id,
        context: event.aggregateType,
        attempt: event.attempts,
        errorType: code,
      });
    } finally {
      const durationMs = Math.round(performance.now() - started);
      if (durationMs >= this.config.runtime.slowJobMs)
        this.logger.event('warn', 'Slow outbox event', {
          operation: 'outbox_event_slow',
          entityId: event.id,
          context: event.type,
          durationMs,
        });
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.message))
    return error.message;
  return 'OUTBOX_PROCESSING_FAILED';
}
