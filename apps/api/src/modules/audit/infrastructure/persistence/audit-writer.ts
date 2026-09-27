import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { validateAuditMetadata } from '../../domain/audit.types';
import type { AuditEntry } from '../../domain/audit.types';
import { AuditLog } from './audit-log.entity';

/** Append only. A caller can supply its transaction manager for atomic business + audit writes. */
export class AuditWriter {
  constructor(private readonly source: DataSource) {}

  async append(
    entry: AuditEntry,
    manager: EntityManager = this.source.manager,
  ): Promise<string> {
    const metadata = entry.metadata ?? {};
    validateAuditMetadata(metadata);
    const id = randomUUID();
    await manager.insert(AuditLog, { ...entry, metadata: { ...metadata }, id });
    return id;
  }
}
