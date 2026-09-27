import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
@Module({
  imports: [PlatformModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
