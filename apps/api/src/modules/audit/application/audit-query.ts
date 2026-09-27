import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { AuditLog } from '../infrastructure/persistence/audit-log.entity';

export interface AuditFilters {
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit: number;
}
export interface AuditPosition {
  createdAt: string;
  id: string;
}

@Injectable()
export class AuditQuery {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
  ) {}

  async list(
    filters: AuditFilters,
    position: AuditPosition | null,
    manager: EntityManager = this.database.source.manager,
  ) {
    const query = manager
      .getRepository(AuditLog)
      .createQueryBuilder('audit')
      .addSelect('audit.metadata');
    if (filters.actorUserId)
      query.andWhere('audit.actorUserId = :actorUserId', {
        actorUserId: filters.actorUserId,
      });
    if (filters.targetType)
      query.andWhere('audit.targetType = :targetType', {
        targetType: filters.targetType,
      });
    if (filters.targetId)
      query.andWhere('audit.targetId = :targetId', {
        targetId: filters.targetId,
      });
    if (filters.action)
      query.andWhere('audit.action = :action', { action: filters.action });
    if (filters.from)
      query.andWhere('audit.createdAt >= :from', { from: filters.from });
    if (filters.to)
      query.andWhere('audit.createdAt <= :to', { to: filters.to });
    if (position)
      query.andWhere(
        '(audit.createdAt < :cursorCreated OR (audit.createdAt = :cursorCreated AND audit.id < :cursorId))',
        { cursorCreated: position.createdAt, cursorId: position.id },
      );
    const result = await query
      .addSelect(
        `to_char(audit.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'cursor_created_at',
      )
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .limit(filters.limit + 1)
      .getRawAndEntities();
    return {
      rows: result.entities,
      cursorCreatedById: new Map<string, string>(
        result.entities.map((row, index) => [
          row.id,
          (result.raw[index] as { cursor_created_at: string })
            .cursor_created_at,
        ]),
      ),
    };
  }

  async recentForTarget(
    targetType: string,
    targetId: string,
    limit: number,
    manager: EntityManager,
  ) {
    return (await this.list({ targetType, targetId, limit }, null, manager))
      .rows;
  }
}
