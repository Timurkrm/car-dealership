import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig, LogLevel } from '../../config/config';
import { requestContext } from '../http/request-context';

export interface LogFields {
  entityId?: string;
  requestId?: string;
  operation?: string;
  statusCode?: number;
  durationMs?: number;
  context?: string;
  errorType?: string;
  listingId?: string;
  jobId?: string;
  attempt?: number;
  detectedFormat?: string;
  outputBytes?: number;
  geoMode?: string;
  filterCount?: number;
  resultCount?: number;
  sort?: string;
  listingType?: string;
  zoomBucket?: number;
  clusterCount?: number;
  truncated?: boolean;
  notificationId?: string;
  channel?: string;
  provider?: string;
  result?: string;
  pendingCount?: number;
  oldestPendingSeconds?: number;
  method?: string;
  route?: string;
  table?: string;
  rowsAffected?: number;
  dryRun?: boolean;
}
const weights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
@Injectable()
export class StructuredLogger implements LoggerService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}
  event(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (weights[level] < weights[this.config.logLevel]) return;
    process.stdout.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'api', environment: this.config.environment, message, requestId: requestContext.getStore()?.requestId, ...fields })}\n`,
    );
  }
  log(message: unknown, context?: string): void {
    this.event(
      'info',
      typeof message === 'string' ? message : 'Framework event',
      { context },
    );
  }
  warn(message: unknown, context?: string): void {
    this.event(
      'warn',
      typeof message === 'string' ? message : 'Framework warning',
      { context },
    );
  }
  debug(message: unknown, context?: string): void {
    this.event(
      'debug',
      typeof message === 'string' ? message : 'Framework debug event',
      { context },
    );
  }
  verbose(message: unknown, context?: string): void {
    this.debug(message, context);
  }
  error(_message: unknown, _stack?: string, context?: string): void {
    this.event('error', 'Framework error', { context });
  }
  fatal(message: unknown, context?: string): void {
    this.error(message, undefined, context);
  }
}
