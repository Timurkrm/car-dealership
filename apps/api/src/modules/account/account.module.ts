import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth';
import { EmailDeliveryModule } from '../email-delivery';
import { UsersModule } from '../users';
import { AccountProfileService } from './application/account-profile.service';
import { AccountController } from './http/account.controller';

@Module({
  imports: [PlatformModule, AuthModule, UsersModule, EmailDeliveryModule],
  controllers: [AccountController],
  providers: [AccountProfileService],
})
export class AccountModule {}
