import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth';
import { AuditModule } from '../audit';
import { MediaReadModule } from './application/media-read';
import { MediaCommands } from './application/media-commands';
import { MediaProcessor } from './application/media-processor';
import { MediaCleanup } from './application/media-cleanup';
import { MediaProcessingQueue } from './infrastructure/queue/media-queue';
import { ImageProcessor } from './infrastructure/image/image-processor';
import { MediaController } from './http/media.controller';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';

@Module({
  imports: [PlatformModule, AuthModule, AuditModule, MediaReadModule],
  controllers: [MediaController],
  providers: [
    MediaCommands,
    MediaProcessor,
    MediaCleanup,
    MediaProcessingQueue,
    ImageProcessor,
    RequestRateGuard,
  ],
  exports: [MediaProcessor, MediaCleanup, MediaProcessingQueue],
})
export class MediaModule {
  static register(listings: DynamicModule): DynamicModule {
    return { module: MediaModule, imports: [listings] };
  }
}
