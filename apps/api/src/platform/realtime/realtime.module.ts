import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform.module';
import { RealtimePublisher } from './realtime-publisher';

@Module({
  imports: [PlatformModule],
  providers: [RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
