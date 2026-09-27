import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { AppModule } from './app.module';
import type { AppConfig } from './config/config';
import { MediaWorker } from './modules/media';
/** Process composition root; shared modules retain their normal ownership boundaries. */
@Module({ providers: [MediaWorker] })
export class MediaWorkerApplication {
  static register(config: AppConfig): DynamicModule {
    return {
      module: MediaWorkerApplication,
      imports: [AppModule.register(config)],
    };
  }
}
