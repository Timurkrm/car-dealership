import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth';
import { AuditModule } from '../audit';
import { NotificationsModule } from '../notifications';
import { UsersModule } from '../users';
import { RequestRateGuard } from '../../platform/http/request-rate.guard';
import { AdminService } from './application/admin.service';
import { AdminController } from './http/admin.controller';

@Module({})
export class AdminModule {
  static register(
    listings: DynamicModule,
    moderation: DynamicModule,
  ): DynamicModule {
    return {
      module: AdminModule,
      imports: [
        PlatformModule,
        AuthModule,
        AuditModule,
        NotificationsModule,
        UsersModule,
        listings,
        moderation,
      ],
      controllers: [AdminController],
      providers: [AdminService, RequestRateGuard],
    };
  }
}
