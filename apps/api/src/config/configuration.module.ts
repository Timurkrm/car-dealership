import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_CONFIG } from './config';
import type { AppConfig } from './config';

@Global()
@Module({})
export class ConfigurationModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ConfigurationModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
