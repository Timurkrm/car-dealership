import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import type { EntityManager } from 'typeorm';
import { NotificationPreference } from '../infrastructure/persistence/notification-preference.entity';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferenceView,
} from '../domain/email-delivery.types';

export interface MutableNotificationPreferences {
  messagesEmail: boolean;
  savedSearchesEmail: boolean;
  favoritesEmail: boolean;
  moderationEmail: boolean;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
  ) {}

  async get(
    userId: string,
    manager: EntityManager = this.database.source.manager,
  ): Promise<NotificationPreferenceView> {
    const row = await manager.findOneBy(NotificationPreference, { userId });
    return row ? this.view(row) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  async update(
    userId: string,
    value: MutableNotificationPreferences,
  ): Promise<NotificationPreferenceView> {
    await this.database.source.manager
      .createQueryBuilder()
      .insert()
      .into(NotificationPreference)
      .values({
        userId,
        messagesEmailEnabled: value.messagesEmail,
        savedSearchesEmailEnabled: value.savedSearchesEmail,
        favoritesEmailEnabled: value.favoritesEmail,
        moderationEmailEnabled: value.moderationEmail,
      })
      .orUpdate(
        [
          'messages_email_enabled',
          'saved_searches_email_enabled',
          'favorites_email_enabled',
          'moderation_email_enabled',
          'updated_at',
        ],
        ['user_id'],
      )
      .execute();
    return { ...value, securityEmail: true };
  }

  async batch(
    userIds: readonly string[],
  ): Promise<Map<string, NotificationPreferenceView>> {
    if (!userIds.length) return new Map();
    const rows: Array<{
      userId: string;
      messagesEmail: boolean;
      savedSearchesEmail: boolean;
      favoritesEmail: boolean;
      moderationEmail: boolean;
    }> = await this.database.source.query(
      `SELECT user_id AS "userId", messages_email_enabled AS "messagesEmail",
        saved_searches_email_enabled AS "savedSearchesEmail",
        favorites_email_enabled AS "favoritesEmail",
        moderation_email_enabled AS "moderationEmail"
       FROM notification_preferences WHERE user_id = ANY($1::uuid[])`,
      [[...new Set(userIds)]],
    );
    return new Map(
      rows.map((row) => [
        row.userId,
        {
          messagesEmail: row.messagesEmail,
          savedSearchesEmail: row.savedSearchesEmail,
          favoritesEmail: row.favoritesEmail,
          moderationEmail: row.moderationEmail,
          securityEmail: true as const,
        },
      ]),
    );
  }

  private view(row: NotificationPreference): NotificationPreferenceView {
    return {
      messagesEmail: row.messagesEmailEnabled,
      savedSearchesEmail: row.savedSearchesEmailEnabled,
      favoritesEmail: row.favoritesEmailEnabled,
      moderationEmail: row.moderationEmailEnabled,
      securityEmail: true,
    };
  }
}
