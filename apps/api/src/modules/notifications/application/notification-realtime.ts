import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { RealtimePublisher } from '../../../platform/realtime/realtime-publisher';
import { REALTIME_EVENTS } from '../../../platform/realtime/realtime-events';
import { Notification } from '../infrastructure/persistence/notification.entity';
import { mapPublicNotification } from './notification-center';

@Injectable()
export class NotificationRealtime {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async created(ids: readonly string[]): Promise<void> {
    if (!ids.length) return;
    const rows = await this.database.source
      .getRepository(Notification)
      .createQueryBuilder('notification')
      .addSelect('notification.payload')
      .where({ id: In([...ids]) })
      .getMany();
    await Promise.all(
      rows.map((row) =>
        this.realtime.notificationCreated(
          row.userId,
          mapPublicNotification(row),
        ),
      ),
    );
  }

  read(userId: string, payload: unknown): Promise<void> {
    return this.realtime.users(
      [userId],
      REALTIME_EVENTS.notificationRead,
      payload,
    );
  }

  readAll(userId: string, payload: unknown): Promise<void> {
    return this.realtime.users(
      [userId],
      REALTIME_EVENTS.notificationsReadAll,
      payload,
    );
  }
}
