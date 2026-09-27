import { Column, Entity, ForeignKey, Unique } from 'typeorm';
import { MutableRecord } from '../../../../platform/database/record';

@Entity('notification_preferences')
@Unique('uq_notification_preferences_user', ['userId'])
export class NotificationPreference extends MutableRecord {
  @Column({ name: 'user_id', type: 'uuid' })
  @ForeignKey('User', {
    name: 'fk_notification_preferences_user',
    onDelete: 'CASCADE',
  })
  userId!: string;

  @Column({ name: 'messages_email_enabled', type: 'boolean', default: true })
  messagesEmailEnabled!: boolean;

  @Column({
    name: 'saved_searches_email_enabled',
    type: 'boolean',
    default: false,
  })
  savedSearchesEmailEnabled!: boolean;

  @Column({ name: 'favorites_email_enabled', type: 'boolean', default: true })
  favoritesEmailEnabled!: boolean;

  @Column({ name: 'moderation_email_enabled', type: 'boolean', default: true })
  moderationEmailEnabled!: boolean;
}
