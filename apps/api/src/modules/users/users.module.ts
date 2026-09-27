import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { DatabaseConnection } from '../../platform/database/database.connection';
import { UserIdentity } from './infrastructure/persistence/user-identity';
import { UserAdministrationRecords } from './application/user-administration-records';

@Module({
  imports: [PlatformModule],
  providers: [
    {
      provide: UserIdentity,
      inject: [DatabaseConnection],
      useFactory: (database: DatabaseConnection) =>
        new UserIdentity(database.source),
    },
    UserAdministrationRecords,
  ],
  exports: [UserIdentity, UserAdministrationRecords],
})
export class UsersModule {}
