import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth';
import { FavoritesService } from './application/favorites.service';
import { FavoritesController } from './http/favorites.controller';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';

@Module({})
export class FavoritesModule {
  static register(listings: DynamicModule): DynamicModule {
    return {
      module: FavoritesModule,
      imports: [PlatformModule, AuthModule, listings],
      controllers: [FavoritesController],
      providers: [FavoritesService, RequestRateGuard],
      exports: [FavoritesService],
    };
  }
}
