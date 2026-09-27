import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config';
import { EmailDeliveryWorker } from './modules/email-delivery';
import { UsersModule } from './modules/users';

/** Separate process boundary for bounded external email provider I/O. */
@Module({ providers: [EmailDeliveryWorker] })
export class DeliveryWorkerApplication {
  static register(config: AppConfig): DynamicModule {
    return {
      module: DeliveryWorkerApplication,
      imports: [AppModule.register(config), UsersModule],
    };
  }
}
