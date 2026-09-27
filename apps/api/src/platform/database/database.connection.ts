import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { StructuredLogger } from '../logging/structured-logger';
import { databaseOptions } from './database-options';

@Injectable()
export class DatabaseConnection implements OnModuleInit, OnApplicationShutdown {
  readonly source: DataSource;
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {
    this.source = new DataSource(databaseOptions(config));
  }
  async onModuleInit(): Promise<void> {
    await this.source.initialize();
    this.logger.event('info', 'Database connected', {
      operation: 'database_connect',
    });
  }
  async check(): Promise<void> {
    const result: unknown = await this.source.query(
      `SELECT current_setting('transaction_read_only') = 'off' AS writable
       WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')`,
    );
    if (
      !Array.isArray(result) ||
      result.length !== 1 ||
      result[0]?.writable !== true
    )
      throw new Error('Writable PostGIS unavailable');
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.source.isInitialized) await this.source.destroy();
    this.logger.event('info', 'Database disconnected', {
      operation: 'database_disconnect',
    });
  }
}
