import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { DatabaseConnection } from '../../platform/database/database.connection';
import { UsersModule } from '../users';
import { AuditModule } from '../audit';
import { AuthPersistence } from './infrastructure/persistence/auth.persistence';
import { PasswordHasher } from './infrastructure/crypto/password-hasher';
import { AuthTokens } from './infrastructure/crypto/auth-tokens';
import { EmailDeliveryModule } from '../email-delivery';
import { AccountAuthService } from './application/account-auth.service';
import { SessionService } from './application/session.service';
import { PasswordAuthService } from './application/password-auth.service';
import { SecurityActionsService } from './application/security-actions.service';
import { SessionAdministration } from './application/session-administration';
import { AuthController } from './http/auth.controller';
import {
  AuthenticationGuard,
  AuthOriginGuard,
  RolesGuard,
} from './http/auth.guards';
import { AuthRateGuard, AuthRateLimiter } from './http/auth-rate.guard';
import { AccountSessionsService } from './application/account-sessions.service';
import { EmailChangeService } from './application/email-change.service';

@Module({
  imports: [PlatformModule, UsersModule, AuditModule, EmailDeliveryModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthPersistence,
      inject: [DatabaseConnection],
      useFactory: (db: DatabaseConnection) => new AuthPersistence(db.source),
    },
    PasswordHasher,
    AuthTokens,
    AccountAuthService,
    SessionService,
    PasswordAuthService,
    SecurityActionsService,
    SessionAdministration,
    AccountSessionsService,
    EmailChangeService,
    AuthenticationGuard,
    AuthOriginGuard,
    RolesGuard,
    AuthRateGuard,
    AuthRateLimiter,
  ],
  exports: [
    AuthenticationGuard,
    AuthOriginGuard,
    RolesGuard,
    SessionService,
    SessionAdministration,
    AccountSessionsService,
    EmailChangeService,
  ],
})
export class AuthModule {}
