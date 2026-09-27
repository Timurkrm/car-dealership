import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Notification } from '../infrastructure/persistence/notification.entity';
import type { NotificationType } from '../domain/notification.types';
import { notificationPayload } from '../domain/notification.types';
import { EmailDeliveryRecords } from '../../email-delivery';

@Injectable()
export class NotificationWriter {
  constructor(
    @Inject(EmailDeliveryRecords)
    private readonly deliveries: EmailDeliveryRecords,
  ) {}
  async moderationResult(
    userId: string,
    listingId: string,
    status: 'PUBLISHED' | 'REJECTED' | 'ARCHIVED',
    reasonCode: string,
    sellerMessage: string | null,
    manager: EntityManager,
  ): Promise<string> {
    const id = randomUUID();
    await manager.insert(Notification, {
      id,
      userId,
      type: 'MODERATION_RESULT',
      payload: notificationPayload('MODERATION_RESULT', {
        listingId,
        status,
        reasonCode,
        ...(sellerMessage ? { message: sellerMessage } : {}),
      }) as never,
      sourceEventId: null,
    });
    await this.deliveries.scheduleNotification(
      {
        notificationId: id,
        userId,
        template: 'MODERATION_RESULT',
        payload: {
          listingId,
          status,
          reasonCode,
          ...(sellerMessage ? { message: sellerMessage } : {}),
        },
      },
      manager,
    );
    return id;
  }

  async accountStatus(
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED',
    reasonCode: string,
    manager: EntityManager,
  ): Promise<string> {
    const id = randomUUID();
    await manager.insert(Notification, {
      id,
      userId,
      type: 'ACCOUNT_STATUS_CHANGED',
      payload: notificationPayload('ACCOUNT_STATUS_CHANGED', {
        accountStatus: status,
        reasonCode,
      }) as never,
      sourceEventId: null,
    });
    await this.deliveries.scheduleNotification(
      {
        notificationId: id,
        userId,
        template: 'ACCOUNT_STATUS_CHANGED',
        payload: { accountStatus: status },
        mandatory: true,
      },
      manager,
    );
    return id;
  }

  async fanout(
    type: Extract<
      NotificationType,
      'SAVED_SEARCH_MATCH' | 'FAVORITE_LISTING_STATUS_CHANGED'
    >,
    userIds: readonly string[],
    sourceEventId: string,
    payload: Record<string, unknown>,
    manager: EntityManager,
  ): Promise<string[]> {
    if (!userIds.length) return [];
    const safe = notificationPayload(type, payload);
    const rows = userIds.map((userId) => ({
      id: randomUUID(),
      userId,
      type,
      payload: safe as never,
      sourceEventId,
      readAt: null,
    }));
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(rows)
      .orIgnore()
      .returning('id')
      .execute();
    const inserted = new Set(
      (Array.isArray(result.raw) ? result.raw : []).map(
        (value: { id: unknown }) => String(value.id),
      ),
    );
    const created = rows.filter((row) => inserted.has(row.id));
    await this.deliveries.scheduleNotifications(
      created.map((row) => ({
        notificationId: row.id,
        userId: row.userId,
        template:
          type === 'SAVED_SEARCH_MATCH'
            ? ('SAVED_SEARCH_MATCH' as const)
            : ('FAVORITE_STATUS_CHANGED' as const),
        payload: safe,
      })),
      manager,
    );
    return created.map((row) => row.id);
  }

  async newMessage(
    userIds: readonly string[],
    sourceEventId: string,
    payload: {
      conversationId: string;
      messageId: string;
      listingId: string;
      senderPublicName: string;
    },
    manager: EntityManager,
  ): Promise<string[]> {
    if (!userIds.length) return [];
    const safe = notificationPayload('NEW_MESSAGE', payload);
    const rows = userIds.map((userId) => ({
      id: randomUUID(),
      userId,
      type: 'NEW_MESSAGE' as const,
      payload: safe as never,
      sourceEventId,
      readAt: null,
    }));
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(Notification)
      .values(rows)
      .orIgnore()
      .returning('id')
      .execute();
    const inserted = new Set(
      (Array.isArray(result.raw) ? result.raw : []).map(
        (value: { id: unknown }) => String(value.id),
      ),
    );
    const created = rows.filter((row) => inserted.has(row.id));
    await this.deliveries.scheduleNotifications(
      created.map((row) => ({
        notificationId: row.id,
        userId: row.userId,
        template: 'NEW_MESSAGE' as const,
        payload: safe,
      })),
      manager,
    );
    return created.map((row) => row.id);
  }
}
