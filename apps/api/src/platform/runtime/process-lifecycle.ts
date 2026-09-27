import { Injectable } from '@nestjs/common';
import type { AppConfig } from '../../config/config';
import type { StructuredLogger } from '../logging/structured-logger';

export type ProcessPhase = 'ready' | 'shutting_down';

@Injectable()
export class ProcessLifecycle {
  private phase: ProcessPhase = 'ready';

  get current(): ProcessPhase {
    return this.phase;
  }

  beginShutdown(): void {
    this.phase = 'shutting_down';
  }
}

interface ShutdownOptions {
  name: string;
  config: AppConfig;
  lifecycle: ProcessLifecycle;
  logger: Pick<StructuredLogger, 'event'>;
  close: () => Promise<void>;
  force?: () => void;
}

/** Installs one bounded process shutdown path for signals and unknown fatal errors. */
export function installProcessShutdown(options: ShutdownOptions): void {
  let closing: Promise<void> | undefined;
  const shutdown = (reason: string, fatal: boolean): Promise<void> => {
    if (closing) return closing;
    options.lifecycle.beginShutdown();
    options.logger.event(fatal ? 'error' : 'info', 'Process shutting down', {
      operation: 'process_shutdown',
      context: options.name,
      result: reason,
    });
    closing = boundedClose(options)
      .then(() => {
        options.logger.event('info', 'Process shutdown complete', {
          operation: 'process_shutdown_complete',
          context: options.name,
        });
        if (fatal) process.exitCode = 1;
      })
      .catch(() => {
        options.logger.event('error', 'Process shutdown failed', {
          operation: 'process_shutdown_failed',
          context: options.name,
        });
        process.exitCode = 1;
        // A shutdown deadline means a resource is still holding the event
        // loop. Exit after the synchronous structured log has been emitted;
        // durable workers recover their leases on the next process start.
        setImmediate(() => process.exit(1));
      });
    return closing;
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM', false));
  process.once('SIGINT', () => void shutdown('SIGINT', false));
  process.once(
    'uncaughtException',
    () => void shutdown('UNCAUGHT_EXCEPTION', true),
  );
  process.once(
    'unhandledRejection',
    () => void shutdown('UNHANDLED_REJECTION', true),
  );
}

export async function boundedClose(options: ShutdownOptions): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      options.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          options.force?.();
          reject(new Error('SHUTDOWN_TIMEOUT'));
        }, options.config.runtime.shutdownTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
