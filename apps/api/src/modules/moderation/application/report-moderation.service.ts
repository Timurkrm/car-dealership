import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import { OpaqueCursor } from '../../../platform/http/opaque-cursor';
import { requestContext } from '../../../platform/http/request-context';
import { AuditWriter } from '../../audit';
import type { AuthenticatedPrincipal } from '../../auth';
import { ListingModerationRecords } from '../../listings';
import { MessageModerationRecords } from '../../messaging';
import { NotificationRealtime } from '../../notifications';
import { UserAdministrationRecords } from '../../users';
import {
  finalReportStatus,
  reportReasonApplies,
} from '../domain/moderation-policy';
import { ModerationAction } from '../infrastructure/persistence/moderation-action.entity';
import { Report } from '../infrastructure/persistence/report.entity';
import type {
  CreateReportInput,
  ReportQueueQuery,
  ResolveReportInput,
} from '../http/moderation.dto';
import { assertModerator } from './moderation-auth';
import { ListingModerationService } from './listing-moderation.service';

interface ReportPosition {
  createdAt: string;
  id: string;
}
function reportFingerprint(query: ReportQueueQuery): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        status: query.status,
        targetType: query.targetType ?? null,
        reason: query.reason ?? null,
      }),
    )
    .digest('base64url');
}
function reportPosition(value: unknown): value is ReportPosition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'createdAt' in value &&
    typeof value.createdAt === 'string' &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    'id' in value &&
    typeof value.id === 'string',
  );
}

@Injectable()
export class ReportModerationService {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ListingModerationRecords)
    private readonly listings: ListingModerationRecords,
    @Inject(ListingModerationService)
    private readonly listingModeration: ListingModerationService,
    @Inject(UserAdministrationRecords)
    private readonly users: UserAdministrationRecords,
    @Inject(MessageModerationRecords)
    private readonly messages: MessageModerationRecords,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(NotificationRealtime)
    private readonly notificationRealtime: NotificationRealtime,
    @Inject(OpaqueCursor) private readonly cursors: OpaqueCursor,
  ) {}

  async create(principal: AuthenticatedPrincipal, input: CreateReportInput) {
    if (!principal.roles.includes('USER'))
      throw new ApiException(403, 'FORBIDDEN', 'A user account is required');
    if (!reportReasonApplies(input.targetType, input.reason))
      throw new ApiException(
        400,
        'REPORT_REASON_NOT_APPLICABLE',
        'Report reason is not applicable to this target',
      );
    return this.database.source.transaction(async (manager) => {
      const target = await this.validateTarget(
        principal.userId,
        input,
        manager,
      );
      const id = randomUUID();
      try {
        await manager.insert(Report, {
          id,
          reporterId: principal.userId,
          targetType: input.targetType,
          listingId: input.targetType === 'LISTING' ? input.targetId : null,
          targetUserId: input.targetType === 'USER' ? input.targetId : null,
          messageId: input.targetType === 'MESSAGE' ? input.targetId : null,
          reasonCode: input.reason,
          details: input.details ?? null,
          status: 'OPEN',
          resolvedAt: null,
          resolvedBy: null,
          resolution: null,
          resolutionNote: null,
        });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ApiException(
            409,
            'REPORT_DUPLICATE',
            'An active report already exists for this target',
          );
        throw error;
      }
      await this.audit.append(
        {
          actorUserId: principal.userId,
          action: 'REPORT_CREATED',
          targetType: 'REPORT',
          targetId: id,
          requestId: requestContext.getStore()?.requestId ?? null,
          metadata: { reasonCode: input.reason },
        },
        manager,
      );
      return {
        id,
        targetType: input.targetType,
        targetId: target.id,
        reason: input.reason,
        status: 'OPEN' as const,
      };
    });
  }

  async queue(principal: AuthenticatedPrincipal, query: ReportQueueQuery) {
    assertModerator(principal);
    const hash = reportFingerprint(query);
    const decoded = this.decode(query.cursor, hash);
    if (decoded !== null && !reportPosition(decoded))
      throw new ApiException(400, 'REPORT_INVALID_CURSOR', 'Invalid cursor');
    const builder = this.database.source
      .getRepository(Report)
      .createQueryBuilder('report')
      .where('report.status = :status', { status: query.status });
    if (query.targetType)
      builder.andWhere('report.targetType = :targetType', {
        targetType: query.targetType,
      });
    if (query.reason)
      builder.andWhere('report.reasonCode = :reason', { reason: query.reason });
    if (decoded)
      builder.andWhere(
        '(report.createdAt > :cursorCreated OR (report.createdAt = :cursorCreated AND report.id > :cursorId))',
        { cursorCreated: decoded.createdAt, cursorId: decoded.id },
      );
    const result = await builder
      .addSelect(
        `to_char(report.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'cursor_created_at',
      )
      .orderBy('report.createdAt', 'ASC')
      .addOrderBy('report.id', 'ASC')
      .limit(query.limit + 1)
      .getRawAndEntities();
    const rows = result.entities;
    const cursorCreatedById = new Map<string, string>(
      rows.map((row, index) => [
        row.id,
        (result.raw[index] as { cursor_created_at: string }).cursor_created_at,
      ]),
    );
    const page = rows.slice(0, query.limit);
    const reporters = await this.users.summaries(
      [...new Set(page.map((row) => row.reporterId))],
      this.database.source.manager,
    );
    const reporterById = new Map(reporters.map((row) => [row.id, row]));
    const items = page.map((row) => ({
      id: row.id,
      targetType: row.targetType,
      targetId: targetId(row),
      reason: row.reasonCode,
      status: row.status,
      reporter: {
        id: row.reporterId,
        displayName:
          reporterById.get(row.reporterId)?.displayName ?? 'Unknown user',
      },
      createdAt: row.createdAt.toISOString(),
    }));
    const hasNextPage = rows.length > query.limit;
    const last = items.at(-1);
    const cursorCreatedAt = last ? cursorCreatedById.get(last.id) : undefined;
    return {
      items,
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last && cursorCreatedAt
            ? this.cursors.encode('moderation-reports', hash, {
                createdAt: cursorCreatedAt,
                id: last.id,
              })
            : null,
      },
    };
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    assertModerator(principal);
    return this.database.source.transaction(async (manager) => {
      const report = await this.findDetailed(id, manager);
      const reporter = (
        await this.users.summaries([report.reporterId], manager)
      )[0];
      const target = await this.targetSnapshot(report, manager);
      if (report.targetType === 'MESSAGE')
        await this.audit.append(
          {
            actorUserId: principal.userId,
            action: 'MODERATION_MESSAGE_CONTEXT_VIEWED',
            targetType: 'MESSAGE',
            targetId: report.messageId ?? id,
            requestId: requestContext.getStore()?.requestId ?? null,
          },
          manager,
        );
      const relatedCount = await this.relatedCount(report, manager);
      const history = await this.targetHistory(report, manager);
      return {
        id: report.id,
        targetType: report.targetType,
        targetId: targetId(report),
        reason: report.reasonCode,
        details: report.details,
        status: report.status,
        resolution: report.resolution,
        resolutionNote: report.resolutionNote,
        resolvedAt: report.resolvedAt?.toISOString() ?? null,
        createdAt: report.createdAt.toISOString(),
        reporter: reporter
          ? {
              id: reporter.id,
              displayName: reporter.displayName,
              email: reporter.emailNormalized,
            }
          : null,
        target,
        relatedReports: Math.max(0, relatedCount - 1),
        moderationHistory: history,
      };
    });
  }

  async resolve(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ResolveReportInput,
  ) {
    assertModerator(principal);
    if (input.outcome === 'DISMISSED' && input.resolution !== 'NO_ACTION')
      throw new ApiException(
        400,
        'REPORT_INVALID_RESOLUTION',
        'Dismissed reports require NO_ACTION',
      );
    const notificationId = await this.database.source.transaction(
      async (manager) => {
        const report = await manager
          .getRepository(Report)
          .createQueryBuilder('report')
          .where('report.id = :id', { id })
          .setLock('pessimistic_write')
          .getOne();
        if (!report)
          throw new ApiException(404, 'REPORT_NOT_FOUND', 'Report not found');
        if (report.status === 'RESOLVED' || report.status === 'DISMISSED')
          throw new ApiException(
            409,
            'REPORT_ALREADY_RESOLVED',
            'Report is already final',
          );
        finalReportStatus(report.status, input.outcome);
        let notificationId: string | null = null;
        if (input.resolution === 'CONTENT_REMOVED') {
          if (
            report.targetType !== 'LISTING' ||
            !report.listingId ||
            !input.targetVersion
          )
            throw new ApiException(
              400,
              'REPORT_INVALID_RESOLUTION',
              'Content removal requires a listing target and targetVersion',
            );
          notificationId = await this.listingModeration.removeInTransaction(
            principal,
            report.listingId,
            input.targetVersion,
            {
              reasonCode: 'PROHIBITED_CONTENT',
              sellerMessage: 'Объявление снято после рассмотрения жалобы.',
              internalNote: input.note,
            },
            manager,
          );
        }
        const now = new Date();
        const update = await manager
          .createQueryBuilder()
          .update(Report)
          .set({
            status: input.outcome,
            resolution: input.resolution,
            resolutionNote: input.note ?? null,
            resolvedAt: now,
            resolvedBy: principal.userId,
            updatedAt: () => 'CURRENT_TIMESTAMP',
          })
          .where("id = :id AND status IN ('OPEN', 'IN_REVIEW')", { id })
          .execute();
        if (update.affected !== 1)
          throw new ApiException(
            409,
            'REPORT_ALREADY_RESOLVED',
            'Report is already final',
          );
        await this.audit.append(
          {
            actorUserId: principal.userId,
            action:
              input.outcome === 'DISMISSED'
                ? 'REPORT_DISMISSED'
                : 'REPORT_RESOLVED',
            targetType: 'REPORT',
            targetId: id,
            requestId: requestContext.getStore()?.requestId ?? null,
            metadata: { reasonCode: input.resolution },
          },
          manager,
        );
        return notificationId;
      },
    );
    if (notificationId)
      await this.notificationRealtime.created([notificationId]);
    return this.detail(principal, id);
  }

  private async validateTarget(
    reporterId: string,
    input: CreateReportInput,
    manager: EntityManager,
  ) {
    if (input.targetType === 'LISTING') {
      const listing = await this.listings
        .target(input.targetId, manager)
        .catch(() => null);
      if (!listing)
        throw new ApiException(
          404,
          'REPORT_INVALID_TARGET',
          'Report target not found',
        );
      if (listing.sellerId === reporterId)
        throw new ApiException(
          400,
          'REPORT_SELF_TARGET',
          'You cannot report your own content',
        );
      return listing;
    }
    if (input.targetType === 'USER') {
      const user = await this.users.find(input.targetId, manager);
      if (!user)
        throw new ApiException(
          404,
          'REPORT_INVALID_TARGET',
          'Report target not found',
        );
      if (user.id === reporterId)
        throw new ApiException(
          400,
          'REPORT_SELF_TARGET',
          'You cannot report yourself',
        );
      return user;
    }
    return this.messages.assertReportable(input.targetId, reporterId, manager);
  }

  private async findDetailed(id: string, manager: EntityManager) {
    const row = await manager
      .getRepository(Report)
      .createQueryBuilder('report')
      .addSelect(['report.details', 'report.resolutionNote'])
      .where('report.id = :id', { id })
      .getOne();
    if (!row)
      throw new ApiException(404, 'REPORT_NOT_FOUND', 'Report not found');
    return row;
  }

  private async targetSnapshot(report: Report, manager: EntityManager) {
    if (report.targetType === 'LISTING' && report.listingId) {
      const row = await this.listings
        .target(report.listingId, manager)
        .catch(() => null);
      return row
        ? {
            id: row.id,
            type: row.type,
            title: row.title,
            status: row.status,
            sellerId: row.sellerId,
            version: row.version,
          }
        : { id: report.listingId, unavailable: true };
    }
    if (report.targetType === 'USER' && report.targetUserId) {
      const row = await this.users.find(report.targetUserId, manager);
      return row
        ? {
            id: row.id,
            displayName: row.displayName,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
          }
        : { id: report.targetUserId, unavailable: true };
    }
    return report.messageId
      ? ((await this.messages.context(report.messageId, manager)) ?? {
          id: report.messageId,
          unavailable: true,
        })
      : null;
  }

  private relatedCount(
    report: Report,
    manager: EntityManager,
  ): Promise<number> {
    const builder = manager
      .getRepository(Report)
      .createQueryBuilder('related')
      .where('related.targetType = :targetType', {
        targetType: report.targetType,
      });
    const field =
      report.targetType === 'LISTING'
        ? 'listingId'
        : report.targetType === 'USER'
          ? 'targetUserId'
          : 'messageId';
    return builder
      .andWhere(`related.${field} = :targetId`, {
        targetId: targetId(report),
      })
      .getCount();
  }

  private async targetHistory(report: Report, manager: EntityManager) {
    const builder = manager
      .getRepository(ModerationAction)
      .createQueryBuilder('action')
      .addSelect(['action.sellerMessage', 'action.internalNote']);
    if (report.targetType === 'LISTING')
      builder.where('action.listingId = :id', { id: report.listingId });
    else if (report.targetType === 'USER')
      builder.where('action.targetUserId = :id', { id: report.targetUserId });
    else builder.where('action.messageId = :id', { id: report.messageId });
    const rows = await builder
      .orderBy('action.createdAt', 'DESC')
      .addOrderBy('action.id', 'DESC')
      .limit(50)
      .getMany();
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      reasonCode: row.reasonCode,
      internalNote: row.internalNote,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private decode(cursor: string | undefined, hash: string): unknown | null {
    try {
      return this.cursors.decode(cursor, 'moderation-reports', hash);
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === 'CURSOR_QUERY_MISMATCH'
      )
        throw new ApiException(
          400,
          'REPORT_CURSOR_QUERY_MISMATCH',
          error.safeMessage,
        );
      throw new ApiException(
        400,
        'REPORT_INVALID_CURSOR',
        'Invalid or expired cursor',
      );
    }
  }
}

function targetId(report: Report): string {
  const id = report.listingId ?? report.targetUserId ?? report.messageId;
  if (!id) throw new Error('Report target invariant violated');
  return id;
}
function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505',
  );
}
