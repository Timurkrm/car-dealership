import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ApiException } from '../../../platform/http/api-error';
import { OpaqueCursor } from '../../../platform/http/opaque-cursor';
import { requestContext } from '../../../platform/http/request-context';
import { AuditWriter } from '../../audit';
import type { AuthenticatedPrincipal } from '../../auth';
import {
  ListingModerationRecords,
  type ModerationQueuePosition,
} from '../../listings';
import { NotificationRealtime, NotificationWriter } from '../../notifications';
import { UserAdministrationRecords } from '../../users';
import { OutboxWriter } from '../../outbox';
import { MessageModerationRecords } from '../../messaging';
import { ModerationAction } from '../infrastructure/persistence/moderation-action.entity';
import { nextModerationListingStatus } from '../domain/moderation-policy';
import type {
  ModerationListingQuery,
  RejectListingInput,
  RemoveListingInput,
} from '../http/moderation.dto';
import { assertModerator } from './moderation-auth';

function fingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url');
}
function validPosition(value: unknown): value is ModerationQueuePosition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'submittedAt' in value &&
    typeof value.submittedAt === 'string' &&
    !Number.isNaN(Date.parse(value.submittedAt)) &&
    'id' in value &&
    typeof value.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value.id),
  );
}

@Injectable()
export class ListingModerationService {
  constructor(
    @Inject(ListingModerationRecords)
    private readonly listings: ListingModerationRecords,
    @Inject(UserAdministrationRecords)
    private readonly users: UserAdministrationRecords,
    @Inject(NotificationWriter)
    private readonly notifications: NotificationWriter,
    @Inject(NotificationRealtime)
    private readonly notificationRealtime: NotificationRealtime,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(OpaqueCursor) private readonly cursors: OpaqueCursor,
    @Inject(OutboxWriter) private readonly outbox: OutboxWriter,
    @Inject(MessageModerationRecords)
    private readonly messages: MessageModerationRecords,
  ) {}

  async queue(
    principal: AuthenticatedPrincipal,
    query: ModerationListingQuery,
  ) {
    assertModerator(principal);
    const canonical = {
      type: query.type ?? null,
      sellerId: query.sellerId ?? null,
      listingId: query.listingId ?? null,
      submittedFrom: query.submittedFrom ?? null,
      submittedTo: query.submittedTo ?? null,
    };
    if (
      query.submittedFrom &&
      query.submittedTo &&
      query.submittedFrom > query.submittedTo
    )
      throw new ApiException(
        400,
        'MODERATION_INVALID_RANGE',
        'Invalid submitted date range',
      );
    const hash = fingerprint(canonical);
    const decoded = this.decode(query.cursor, 'moderation-listings', hash);
    if (decoded !== null && !validPosition(decoded))
      throw new ApiException(
        400,
        'MODERATION_INVALID_CURSOR',
        'Invalid cursor',
      );
    const result = await this.listings.list(
      {
        ...canonical,
        type: query.type,
        sellerId: query.sellerId,
        listingId: query.listingId,
        submittedFrom: query.submittedFrom
          ? new Date(query.submittedFrom)
          : undefined,
        submittedTo: query.submittedTo
          ? new Date(query.submittedTo)
          : undefined,
        limit: query.limit,
      },
      decoded,
    );
    const hasNextPage = result.rows.length > query.limit;
    const last = result.items.at(-1);
    const cursorSubmittedAt = last
      ? result.cursorSubmittedById.get(last.id)
      : undefined;
    return {
      items: result.items,
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last && cursorSubmittedAt
            ? this.cursors.encode('moderation-listings', hash, {
                submittedAt: cursorSubmittedAt,
                id: last.id,
              })
            : null,
      },
    };
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    assertModerator(principal);
    return this.listings.transaction(async (manager) => {
      const target = await this.listings.target(id, manager).catch(() => {
        throw new ApiException(
          404,
          'MODERATION_LISTING_NOT_FOUND',
          'Listing not found',
        );
      });
      // A transaction-scoped EntityManager owns one PostgreSQL client; keep its
      // statements sequential instead of issuing concurrent queries on it.
      const listing = await this.listings.detail(id, manager);
      const sellers = await this.users.summaries([target.sellerId], manager);
      const history = await this.history(id, manager);
      const seller = sellers[0];
      return {
        ...listing,
        seller: seller
          ? {
              id: seller.id,
              displayName: seller.displayName,
              email: seller.emailNormalized,
              status: seller.status,
            }
          : null,
        privateLocationNotice:
          listing.location && 'exactPoint' in listing.location
            ? 'INTERNAL_PRIVATE_COORDINATE'
            : null,
        moderationHistory: history,
      };
    });
  }

  async approve(
    principal: AuthenticatedPrincipal,
    id: string,
    expectedVersion: number,
  ) {
    assertModerator(principal);
    const notificationId = await this.listings.transaction(async (manager) => {
      const listing = await this.checkedPending(id, expectedVersion, manager);
      const nextStatus = nextModerationListingStatus(listing.status, 'approve');
      const seller = await this.users.lock(listing.sellerId, manager);
      if (!seller || seller.status !== 'ACTIVE')
        throw new ApiException(
          409,
          'MODERATION_SELLER_INELIGIBLE',
          'Seller account is not eligible for publication',
        );
      await this.listings.assertPublishable(listing, manager);
      const now = new Date();
      const version = await this.listings.transition(
        listing,
        nextStatus,
        manager,
        { publishedAt: listing.publishedAt ?? now },
      );
      if (!version) throw versionConflict();
      await this.recordListingAction(
        principal.userId,
        id,
        'APPROVE_LISTING',
        'APPROVED',
        null,
        null,
        manager,
      );
      await this.audit.append(
        {
          actorUserId: principal.userId,
          action: 'LISTING_APPROVED',
          targetType: 'LISTING',
          targetId: id,
          requestId: requestContext.getStore()?.requestId ?? null,
          metadata: {
            previousStatus: listing.status,
            nextStatus: 'PUBLISHED',
            listingType: listing.type,
          },
        },
        manager,
      );
      const notificationId = await this.notifications.moderationResult(
        listing.sellerId,
        id,
        'PUBLISHED',
        'APPROVED',
        null,
        manager,
      );
      await this.outbox.listingLifecycle(
        'LISTING_PUBLISHED',
        {
          schemaVersion: 1,
          listingId: id,
          listingType: listing.type,
          sellerId: listing.sellerId,
          previousStatus: listing.status,
          nextStatus: 'PUBLISHED',
        },
        manager,
      );
      return notificationId;
    });
    await this.notificationRealtime.created([notificationId]);
    return this.detail(principal, id);
  }

  async reject(
    principal: AuthenticatedPrincipal,
    id: string,
    expectedVersion: number,
    input: RejectListingInput,
  ) {
    assertModerator(principal);
    const notificationId = await this.listings.transaction(async (manager) => {
      const listing = await this.checkedPending(id, expectedVersion, manager);
      const nextStatus = nextModerationListingStatus(listing.status, 'reject');
      const version = await this.listings.transition(
        listing,
        nextStatus,
        manager,
      );
      if (!version) throw versionConflict();
      await this.recordListingAction(
        principal.userId,
        id,
        'REJECT_LISTING',
        input.reasonCode,
        input.sellerMessage,
        input.internalNote ?? null,
        manager,
      );
      await this.audit.append(
        {
          actorUserId: principal.userId,
          action: 'LISTING_REJECTED',
          targetType: 'LISTING',
          targetId: id,
          requestId: requestContext.getStore()?.requestId ?? null,
          metadata: {
            reasonCode: input.reasonCode,
            previousStatus: listing.status,
            nextStatus: 'REJECTED',
            listingType: listing.type,
          },
        },
        manager,
      );
      return this.notifications.moderationResult(
        listing.sellerId,
        id,
        'REJECTED',
        input.reasonCode,
        input.sellerMessage,
        manager,
      );
    });
    await this.notificationRealtime.created([notificationId]);
    return this.detail(principal, id);
  }

  async remove(
    principal: AuthenticatedPrincipal,
    id: string,
    expectedVersion: number,
    input: RemoveListingInput,
  ) {
    assertModerator(principal);
    const notificationId = await this.listings.transaction((manager) =>
      this.removeInTransaction(principal, id, expectedVersion, input, manager),
    );
    await this.notificationRealtime.created([notificationId]);
    return this.detail(principal, id);
  }

  async removeInTransaction(
    principal: AuthenticatedPrincipal,
    id: string,
    expectedVersion: number,
    input: RemoveListingInput,
    manager: EntityManager,
  ): Promise<string> {
    assertModerator(principal);
    const listing = await this.listings.lock(id, manager).catch(() => {
      throw new ApiException(
        404,
        'MODERATION_LISTING_NOT_FOUND',
        'Listing not found',
      );
    });
    if (listing.version !== expectedVersion) throw versionConflict();
    const nextStatus = nextModerationListingStatus(listing.status, 'remove');
    const version = await this.listings.transition(
      listing,
      nextStatus,
      manager,
      {
        archivedAt: new Date(),
      },
    );
    if (!version) throw versionConflict();
    await this.recordListingAction(
      principal.userId,
      id,
      'REMOVE_LISTING',
      input.reasonCode,
      input.sellerMessage,
      input.internalNote ?? null,
      manager,
    );
    await this.messages.disableListingConversations(id, manager);
    await this.audit.append(
      {
        actorUserId: principal.userId,
        action: 'LISTING_REMOVED_BY_MODERATOR',
        targetType: 'LISTING',
        targetId: id,
        requestId: requestContext.getStore()?.requestId ?? null,
        metadata: {
          reasonCode: input.reasonCode,
          previousStatus: 'PUBLISHED',
          nextStatus: 'ARCHIVED',
          listingType: listing.type,
        },
      },
      manager,
    );
    const notificationId = await this.notifications.moderationResult(
      listing.sellerId,
      id,
      'ARCHIVED',
      input.reasonCode,
      input.sellerMessage,
      manager,
    );
    await this.outbox.listingLifecycle(
      'LISTING_REMOVED_BY_MODERATOR',
      {
        schemaVersion: 1,
        listingId: id,
        listingType: listing.type,
        sellerId: listing.sellerId,
        previousStatus: listing.status,
        nextStatus: 'ARCHIVED',
      },
      manager,
    );
    return notificationId;
  }

  async sellerResult(principal: AuthenticatedPrincipal, id: string) {
    return this.listings.transaction(async (manager) => {
      const target = await this.listings.target(id, manager).catch(() => null);
      if (!target || target.sellerId !== principal.userId)
        throw new ApiException(404, 'LISTING_NOT_FOUND', 'Listing not found');
      const row = await manager
        .getRepository(ModerationAction)
        .createQueryBuilder('action')
        .addSelect('action.sellerMessage')
        .where('action.listingId = :id', { id })
        .andWhere('action.action IN (:...actions)', {
          actions: ['APPROVE_LISTING', 'REJECT_LISTING', 'REMOVE_LISTING'],
        })
        .orderBy('action.createdAt', 'DESC')
        .addOrderBy('action.id', 'DESC')
        .getOne();
      return row
        ? {
            status: target.status,
            reasonCode: row.reasonCode,
            message: row.sellerMessage,
            decidedAt: row.createdAt.toISOString(),
          }
        : {
            status: target.status,
            reasonCode: null,
            message: null,
            decidedAt: null,
          };
    });
  }

  private async checkedPending(
    id: string,
    expectedVersion: number,
    manager: EntityManager,
  ) {
    const listing = await this.listings.lock(id, manager).catch(() => {
      throw new ApiException(
        404,
        'MODERATION_LISTING_NOT_FOUND',
        'Listing not found',
      );
    });
    if (listing.version !== expectedVersion) throw versionConflict();
    if (listing.status !== 'PENDING_MODERATION')
      throw new ApiException(
        409,
        'MODERATION_INVALID_STATE',
        'Listing is not pending moderation',
      );
    return listing;
  }

  private async history(id: string, manager: EntityManager) {
    const rows = await manager
      .getRepository(ModerationAction)
      .createQueryBuilder('action')
      .addSelect(['action.sellerMessage', 'action.internalNote'])
      .where('action.listingId = :id', { id })
      .orderBy('action.createdAt', 'DESC')
      .addOrderBy('action.id', 'DESC')
      .limit(50)
      .getMany();
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      reasonCode: row.reasonCode,
      sellerMessage: row.sellerMessage,
      internalNote: row.internalNote,
      moderatorId: row.moderatorId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async recordListingAction(
    moderatorId: string,
    listingId: string,
    action: ModerationAction['action'],
    reasonCode: string,
    sellerMessage: string | null,
    internalNote: string | null,
    manager: EntityManager,
  ): Promise<void> {
    await manager.insert(ModerationAction, {
      id: randomUUID(),
      moderatorId,
      targetType: 'LISTING',
      listingId,
      targetUserId: null,
      messageId: null,
      action,
      reasonCode,
      sellerMessage,
      internalNote,
      metadata: {},
    });
  }

  private decode(cursor: string | undefined, scope: string, hash: string) {
    try {
      return this.cursors.decode(cursor, scope, hash);
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === 'CURSOR_QUERY_MISMATCH'
      )
        throw new ApiException(
          400,
          'MODERATION_CURSOR_QUERY_MISMATCH',
          error.safeMessage,
        );
      throw new ApiException(
        400,
        'MODERATION_INVALID_CURSOR',
        'Invalid or expired cursor',
      );
    }
  }
}

function versionConflict(): ApiException {
  return new ApiException(
    409,
    'MODERATION_VERSION_CONFLICT',
    'Listing changed; reload it before retrying',
  );
}
