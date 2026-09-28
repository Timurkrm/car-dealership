import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform.module';
import { MetricsController } from './metrics.controller';

@Module({ imports: [PlatformModule], controllers: [MetricsController] })
export class MetricsModule {}
