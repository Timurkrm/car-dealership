import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { OutboxRecords } from './application/outbox-records';
import { OutboxWriter } from './application/outbox-writer';

@Module({
  imports: [PlatformModule],
  providers: [OutboxWriter, OutboxRecords],
  exports: [OutboxWriter, OutboxRecords],
})
export class OutboxModule {}
