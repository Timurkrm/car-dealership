import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ApiException } from '../../../platform/http/api-error';
import { OpaqueCursor } from '../../../platform/http/opaque-cursor';
import type { AuthenticatedPrincipal } from '../../auth';
import { Notification } from '../infrastructure/persistence/notification.entity';
import type { NotificationListQuery } from '../http/notifications.dto';
import { RealtimePublisher } from '../../../platform/realtime/realtime-publisher';
import { REALTIME_EVENTS } from '../../../platform/realtime/realtime-events';

interface NotificationPosition {
  createdAt: string;
  id: string;
}

@Injectable()
export class NotificationCenter {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(OpaqueCursor) private readonly cursors: OpaqueCursor,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: NotificationListQuery) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ unreadOnly: query.unreadOnly }))
      .digest('base64url');
    const position = this.decode(query.cursor, fingerprint);
    const builder = this.database.source
      .getRepository(Notification)
      .createQueryBuilder('notification')
      .addSelect('notification.payload')
      .addSelect(
        `to_char(notification.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        'cursor_created_at',
      )
      .where('notification.userId = :userId', { userId: principal.userId });
    if (query.unreadOnly) builder.andWhere('notification.readAt IS NULL');
    if (position)
      builder.andWhere(
        '(notification.createdAt < :cursorCreated OR (notification.createdAt = :cursorCreated AND notification.id < :cursorId))',
        { cursorCreated: position.createdAt, cursorId: position.id },
      );
    const result = await builder
      .orderBy('notification.createdAt', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .limit(query.limit + 1)
      .getRawAndEntities();
    const page = result.entities.slice(0, query.limit);
    const items = page.map((row) => mapPublicNotification(row));
    const hasNextPage = result.entities.length > query.limit;
    const lastIndex = page.length - 1;
    const last = page[lastIndex];
    const raw =
      lastIndex >= 0
        ? (result.raw[lastIndex] as { cursor_created_at: string })
        : null;
    return {
      items,
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last && raw
            ? this.cursors.encode('notifications', fingerprint, {
                createdAt: raw.cursor_created_at,
                id: last.id,
              })
            : null,
      },
    };
  }

  async unreadCount(principal: AuthenticatedPrincipal) {
    const count = await this.database.source
      .getRepository(Notification)
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId: principal.userId })
      .andWhere('notification.readAt IS NULL')
      .getCount();
    return { count };
  }

  async markRead(principal: AuthenticatedPrincipal, id: string) {
    const now = new Date();
    const raw: unknown = await this.database.source.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, $1)
       WHERE id = $2 AND user_id = $3
       RETURNING id, read_at`,
      [now, id, principal.userId],
    );
    const rows: { id: string; read_at: Date }[] =
      Array.isArray(raw) && Array.isArray(raw[0])
        ? (raw[0] as { id: string; read_at: Date }[])
        : (raw as { id: string; read_at: Date }[]);
    if (!rows[0])
      throw new ApiException(
        404,
        'NOTIFICATION_NOT_FOUND',
        'Notification not found',
      );
    const result = {
      id: rows[0].id,
      readAt: new Date(rows[0].read_at).toISOString(),
    };
    await this.realtime.users(
      [principal.userId],
      REALTIME_EVENTS.notificationRead,
      result,
    );
    return result;
  }

  async markAllRead(principal: AuthenticatedPrincipal) {
    const cutoff = new Date();
    const result = await this.database.source
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: cutoff })
      .where('user_id = :userId', { userId: principal.userId })
      .andWhere('read_at IS NULL')
      .andWhere('created_at <= :cutoff', { cutoff })
      .execute();
    const response = {
      cutoff: cutoff.toISOString(),
      markedCount: result.affected ?? 0,
    };
    await this.realtime.users(
      [principal.userId],
      REALTIME_EVENTS.notificationsReadAll,
      response,
    );
    return response;
  }

  private decode(
    cursor: string | undefined,
    fingerprint: string,
  ): NotificationPosition | null {
    try {
      const value = this.cursors.decode(cursor, 'notifications', fingerprint);
      if (value === null) return null;
      if (
        !value ||
        typeof value !== 'object' ||
        !('createdAt' in value) ||
        typeof value.createdAt !== 'string' ||
        Number.isNaN(Date.parse(value.createdAt)) ||
        !('id' in value) ||
        typeof value.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.id,
        )
      )
        throw new Error('invalid');
      return value as NotificationPosition;
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === 'CURSOR_QUERY_MISMATCH'
      )
        throw new ApiException(
          400,
          'NOTIFICATION_CURSOR_QUERY_MISMATCH',
          error.safeMessage,
        );
      throw new ApiException(
        400,
        'NOTIFICATION_INVALID_CURSOR',
        'Invalid cursor',
      );
    }
  }
}

export function mapPublicNotification(row: Notification) {
  const payload = row.payload;
  const base = {
    id: row.id,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
  if (row.type === 'NEW_MESSAGE')
    return {
      ...base,
      content: pick(payload, [
        'conversationId',
        'messageId',
        'listingId',
        'senderPublicName',
      ]),
      target: uuidValue(payload.conversationId)
        ? { kind: 'CONVERSATION' as const, id: payload.conversationId }
        : null,
    };
  if (row.type === 'MODERATION_RESULT')
    return {
      ...base,
      content: pick(payload, ['listingId', 'status', 'reasonCode', 'message']),
      target: uuidValue(payload.listingId)
        ? { kind: 'LISTING' as const, id: payload.listingId }
        : null,
    };
  if (row.type === 'ACCOUNT_STATUS_CHANGED')
    return {
      ...base,
      content: pick(payload, ['accountStatus', 'reasonCode']),
      target: null,
    };
  if (
    row.type === 'SAVED_SEARCH_MATCH' ||
    row.type === 'FAVORITE_LISTING_STATUS_CHANGED'
  )
    return {
      ...base,
      content: pick(payload, ['listingId', 'listingType', 'status']),
      target: uuidValue(payload.listingId)
        ? { kind: 'LISTING' as const, id: payload.listingId }
        : null,
    };
  return { ...base, content: {}, target: null };
}

function pick(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys
      .filter((key) =>
        ['string', 'number', 'boolean'].includes(typeof value[key]),
      )
      .map((key) => [key, value[key]]),
  );
}
function uuidValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
