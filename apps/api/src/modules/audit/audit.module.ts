import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { DatabaseConnection } from '../../platform/database/database.connection';
import { AuditWriter } from './infrastructure/persistence/audit-writer';
import { AuditQuery } from './application/audit-query';

@Module({
  imports: [PlatformModule],
  providers: [
    {
      provide: AuditWriter,
      inject: [DatabaseConnection],
      useFactory: (database: DatabaseConnection) =>
        new AuditWriter(database.source),
    },
    AuditQuery,
  ],
  exports: [AuditWriter, AuditQuery],
})
export class AuditModule {}
