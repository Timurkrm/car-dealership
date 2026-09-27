import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import { OpaqueCursor } from '../../../platform/http/opaque-cursor';
import { requestContext } from '../../../platform/http/request-context';
import { AuditQuery, AuditWriter, type AuditPosition } from '../../audit';
import { SessionAdministration, type AuthenticatedPrincipal } from '../../auth';
import { ListingModerationRecords } from '../../listings';
import { ModerationActionWriter } from '../../moderation';
import { NotificationRealtime, NotificationWriter } from '../../notifications';
import {
  UserAdministrationRecords,
  type AdminUserPosition,
  type UserStatus,
} from '../../users';
import type {
  AdminAuditQuery,
  AdminUsersQuery,
  ReplaceRolesInput,
  UserStatusActionInput,
} from '../http/admin.dto';
import {
  canonicalRoles,
  nextAccountStatus,
  sameRoles,
} from '../domain/administration-policy';

function hash(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url');
}
function assertAdmin(principal: AuthenticatedPrincipal): void {
  if (!principal.roles.includes('ADMIN'))
    throw new ApiException(403, 'FORBIDDEN', 'Administrator role required');
}
function position(value: unknown): value is { createdAt: string; id: string } {
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
export class AdminService {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(UserAdministrationRecords)
    private readonly users: UserAdministrationRecords,
    @Inject(SessionAdministration)
    private readonly sessions: SessionAdministration,
    @Inject(ListingModerationRecords)
    private readonly listings: ListingModerationRecords,
    @Inject(ModerationActionWriter)
    private readonly moderationActions: ModerationActionWriter,
    @Inject(NotificationWriter)
    private readonly notifications: NotificationWriter,
    @Inject(NotificationRealtime)
    private readonly notificationRealtime: NotificationRealtime,
    @Inject(AuditWriter) private readonly auditWriter: AuditWriter,
    @Inject(AuditQuery) private readonly auditQuery: AuditQuery,
    @Inject(OpaqueCursor) private readonly cursors: OpaqueCursor,
  ) {}

  async listUsers(principal: AuthenticatedPrincipal, query: AdminUsersQuery) {
    assertAdmin(principal);
    if (
      query.createdFrom &&
      query.createdTo &&
      query.createdFrom > query.createdTo
    )
      throw new ApiException(
        400,
        'ADMIN_INVALID_RANGE',
        'Invalid created date range',
      );
    const canonical = {
      status: query.status ?? null,
      role: query.role ?? null,
      userId: query.userId ?? null,
      email: query.email?.toLowerCase() ?? null,
      createdFrom: query.createdFrom ?? null,
      createdTo: query.createdTo ?? null,
    };
    const fingerprint = hash(canonical);
    const decoded = this.decode(
      query.cursor,
      'admin-users',
      fingerprint,
      'ADMIN_USERS',
    );
    if (decoded !== null && !position(decoded))
      throw new ApiException(
        400,
        'ADMIN_USERS_INVALID_CURSOR',
        'Invalid cursor',
      );
    const result = await this.database.source.transaction(
      'REPEATABLE READ',
      (manager) =>
        this.users.list(
          {
            status: query.status,
            role: query.role,
            userId: query.userId,
            email: query.email,
            createdFrom: query.createdFrom
              ? new Date(query.createdFrom)
              : undefined,
            createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
            limit: query.limit,
          },
          decoded as AdminUserPosition | null,
          manager,
        ),
    );
    const page = result.users.slice(0, query.limit);
    const items = page.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.emailNormalized,
      status: user.status,
      roles: result.rolesByUser.get(user.id) ?? [],
      createdAt: user.createdAt.toISOString(),
    }));
    const hasNextPage = result.users.length > query.limit;
    const last = items.at(-1);
    const cursorCreatedAt = last
      ? result.cursorCreatedById.get(last.id)
      : undefined;
    return {
      items,
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last && cursorCreatedAt
            ? this.cursors.encode('admin-users', fingerprint, {
                createdAt: cursorCreatedAt,
                id: last.id,
              })
            : null,
      },
    };
  }

  async userDetail(principal: AuthenticatedPrincipal, id: string) {
    assertAdmin(principal);
    return this.database.source.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const user = await this.users.find(id, manager);
        if (!user)
          throw new ApiException(404, 'USER_ADMIN_NOT_FOUND', 'User not found');
        const roles = await this.users.roles(id, manager);
        const activeSessionCount = await this.sessions.activeCount(id, manager);
        const listingCounts = await this.listings.sellerCounts(id, manager);
        const recentAudit = await this.auditQuery.recentForTarget(
          'USER',
          id,
          20,
          manager,
        );
        return {
          id: user.id,
          displayName: user.displayName,
          email: user.emailNormalized,
          emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
          status: user.status,
          roles: roles.map((row) => row.role),
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          activeSessionCount,
          listingCounts,
          recentAudit: recentAudit.slice(0, 20).map(safeAudit),
        };
      },
    );
  }

  async statusAction(
    principal: AuthenticatedPrincipal,
    id: string,
    action: 'suspend' | 'block' | 'reactivate',
    input: UserStatusActionInput,
  ) {
    assertAdmin(principal);
    const next: UserStatus =
      action === 'suspend'
        ? 'SUSPENDED'
        : action === 'block'
          ? 'BLOCKED'
          : 'ACTIVE';
    if (principal.userId === id && next !== 'ACTIVE')
      throw new ApiException(
        409,
        'SELF_ADMIN_ACTION_FORBIDDEN',
        'Administrators cannot disable their own account',
      );
    const notificationId = await this.database.source.transaction(
      async (manager) => {
        await this.acquireAdminMutationLock(manager);
        const user = await this.users.lock(id, manager);
        if (!user)
          throw new ApiException(404, 'USER_ADMIN_NOT_FOUND', 'User not found');
        if (user.status !== input.expectedStatus)
          throw new ApiException(
            409,
            'USER_STATUS_CONFLICT',
            'User status changed; reload before retrying',
          );
        const next = nextAccountStatus(user.status, action);
        const roles = (await this.users.roles(id, manager)).map(
          (row) => row.role,
        );
        if (next !== 'ACTIVE' && roles.includes('ADMIN'))
          await this.protectLastAdmin(manager);
        await this.users.setStatus(id, next, manager);
        const now = new Date();
        if (next !== 'ACTIVE') await this.sessions.revokeAll(id, now, manager);
        const moderationAction =
          action === 'suspend'
            ? 'SUSPEND_USER'
            : action === 'block'
              ? 'BLOCK_USER'
              : 'RESTORE_USER';
        await this.moderationActions.user(
          principal.userId,
          id,
          moderationAction,
          input.reasonCode,
          input.note,
          manager,
        );
        const auditAction =
          action === 'suspend'
            ? 'USER_SUSPENDED'
            : action === 'block'
              ? 'USER_BLOCKED'
              : 'USER_REACTIVATED';
        await this.auditWriter.append(
          {
            actorUserId: principal.userId,
            action: auditAction,
            targetType: 'USER',
            targetId: id,
            requestId: requestContext.getStore()?.requestId ?? null,
            metadata: {
              reasonCode: input.reasonCode,
              previousStatus: user.status,
              nextStatus: next,
            },
          },
          manager,
        );
        return this.notifications.accountStatus(
          id,
          next,
          input.reasonCode,
          manager,
        );
      },
    );
    await this.notificationRealtime.created([notificationId]);
    return this.userDetail(principal, id);
  }

  async replaceRoles(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ReplaceRolesInput,
  ) {
    assertAdmin(principal);
    const desired = canonicalRoles(input.roles);
    const expected = canonicalRoles(input.expectedRoles);
    if (principal.userId === id && !desired.includes('ADMIN'))
      throw new ApiException(
        409,
        'SELF_ADMIN_ACTION_FORBIDDEN',
        'Administrators cannot remove their own ADMIN role',
      );
    await this.database.source.transaction(async (manager) => {
      await this.acquireAdminMutationLock(manager);
      const user = await this.users.lock(id, manager);
      if (!user)
        throw new ApiException(404, 'USER_ADMIN_NOT_FOUND', 'User not found');
      const current = (await this.users.roles(id, manager)).map(
        (row) => row.role,
      );
      if (!sameRoles(current, expected))
        throw new ApiException(
          409,
          'USER_ROLES_CONFLICT',
          'Roles changed; reload before retrying',
        );
      if (current.includes('ADMIN') && !desired.includes('ADMIN'))
        await this.protectLastAdmin(manager);
      if (sameRoles(current, desired)) return;
      await this.users.replaceRoles(id, desired, manager);
      await this.auditWriter.append(
        {
          actorUserId: principal.userId,
          action: 'USER_ROLES_CHANGED',
          targetType: 'USER',
          targetId: id,
          requestId: requestContext.getStore()?.requestId ?? null,
          metadata: { changedFields: ['roles'] },
        },
        manager,
      );
    });
    return this.userDetail(principal, id);
  }

  async audit(principal: AuthenticatedPrincipal, query: AdminAuditQuery) {
    assertAdmin(principal);
    if (query.from && query.to && query.from > query.to)
      throw new ApiException(
        400,
        'ADMIN_INVALID_RANGE',
        'Invalid audit date range',
      );
    const canonical = {
      actorUserId: query.actorUserId ?? null,
      targetType: query.targetType ?? null,
      targetId: query.targetId ?? null,
      action: query.action ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
    };
    const fingerprint = hash(canonical);
    const decoded = this.decode(
      query.cursor,
      'admin-audit',
      fingerprint,
      'AUDIT',
    );
    if (decoded !== null && !position(decoded))
      throw new ApiException(400, 'AUDIT_INVALID_CURSOR', 'Invalid cursor');
    const result = await this.auditQuery.list(
      {
        actorUserId: query.actorUserId,
        targetType: query.targetType,
        targetId: query.targetId,
        action: query.action,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit,
      },
      decoded as AuditPosition | null,
    );
    const page = result.rows.slice(0, query.limit);
    const items = page.map(safeAudit);
    const hasNextPage = result.rows.length > query.limit;
    const last = items.at(-1);
    const cursorCreatedAt = last
      ? result.cursorCreatedById.get(last.id)
      : undefined;
    return {
      items,
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last && cursorCreatedAt
            ? this.cursors.encode('admin-audit', fingerprint, {
                createdAt: cursorCreatedAt,
                id: last.id,
              })
            : null,
      },
    };
  }

  private async protectLastAdmin(
    manager: Parameters<UserAdministrationRecords['activeAdminCount']>[0],
  ) {
    if ((await this.users.activeAdminCount(manager)) <= 1)
      throw new ApiException(
        409,
        'LAST_ADMIN_PROTECTION',
        'The last active administrator cannot be disabled or demoted',
      );
  }

  private async acquireAdminMutationLock(
    manager: Parameters<UserAdministrationRecords['activeAdminCount']>[0],
  ): Promise<void> {
    // Serialize account/role mutations before taking user-row locks. This
    // provides a global order for cross-admin actions and last-admin checks.
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtext('marketplace:admin-mutation'))`,
    );
  }

  private decode(
    cursor: string | undefined,
    scope: string,
    fingerprint: string,
    prefix: string,
  ): unknown | null {
    try {
      return this.cursors.decode(cursor, scope, fingerprint);
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === 'CURSOR_QUERY_MISMATCH'
      )
        throw new ApiException(
          400,
          `${prefix}_CURSOR_QUERY_MISMATCH`,
          error.safeMessage,
        );
      throw new ApiException(
        400,
        `${prefix}_INVALID_CURSOR`,
        'Invalid or expired cursor',
      );
    }
  }
}

function safeAudit(
  row: Awaited<ReturnType<AuditQuery['list']>>['rows'][number],
) {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    requestId: row.requestId,
    metadata: row.metadata,
  };
}
