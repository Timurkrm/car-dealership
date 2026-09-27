import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { VehicleCatalog } from './application/vehicle-catalog';
import { VehicleRecords } from './application/vehicle-records';
import { VehicleSearchProjection } from './application/vehicle-search-projection';
import { VehicleCatalogController } from './http/vehicle-catalog.controller';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';

@Module({
  imports: [PlatformModule],
  controllers: [VehicleCatalogController],
  providers: [
    VehicleCatalog,
    VehicleRecords,
    VehicleSearchProjection,
    RequestRateGuard,
  ],
  exports: [VehicleRecords, VehicleSearchProjection, VehicleCatalog],
})
export class VehiclesModule {}
