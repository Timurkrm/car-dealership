import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { VehiclesModule } from '../vehicles';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';
import { PartCatalog } from './application/part-catalog';
import { PartRecords } from './application/part-records';
import { PartSearchProjection } from './application/part-search-projection';
import { PartCatalogController } from './http/part-catalog.controller';

@Module({
  imports: [PlatformModule, VehiclesModule],
  providers: [PartCatalog, PartRecords, PartSearchProjection, RequestRateGuard],
  controllers: [PartCatalogController],
  exports: [PartRecords, PartCatalog, PartSearchProjection],
})
export class PartsModule {}
