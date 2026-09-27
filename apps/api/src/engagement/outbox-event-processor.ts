import { Inject, Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { APP_CONFIG } from '../config/config';
import type { AppConfig } from '../config/config';
import { StructuredLogger } from '../platform/logging/structured-logger';
import { FavoritesService } from '../modules/favorites';
import {
  NotificationRealtime,
  NotificationWriter,
} from '../modules/notifications';
import { OutboxRecords } from '../modules/outbox';
import type {
  ListingLifecycleEvent,
  MessageCreatedEvent,
  OutboxDomainEvent,
} from '../modules/outbox';
import { SavedSearchMatcher, matchesSavedSearch } from '../modules/search';
import { UserIdentity } from '../modules/users';
import { MessageEventReader } from '../modules/messaging';

@Injectable()
export class OutboxEventProcessor {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OutboxRecords) private readonly outbox: OutboxRecords,
    @Inject(SavedSearchMatcher)
    private readonly savedSearches: SavedSearchMatcher,
    @Inject(FavoritesService) private readonly favorites: FavoritesService,
    @Inject(NotificationWriter)
    private readonly notifications: NotificationWriter,
    @Inject(NotificationRealtime)
    private readonly notificationRealtime: NotificationRealtime,
    @Inject(MessageEventReader)
    private readonly messages: MessageEventReader,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}

  async process(event: OutboxDomainEvent): Promise<number> {
    const start = performance.now();
    if (event.type === 'MESSAGE_CREATED') {
      const count = await this.messageNotification(event);
      await this.outbox.complete(event.id);
      this.logger.event('info', 'Outbox event processed', {
        operation: 'outbox_process',
        entityId: event.id,
        context: event.aggregateType,
        resultCount: count,
        durationMs: Math.round(performance.now() - start),
        attempt: event.attempts,
      });
      return count;
    }
    const count =
      event.type === 'LISTING_PUBLISHED'
        ? await this.savedSearchFanout(event)
        : await this.favoriteFanout(event);
    await this.outbox.complete(event.id);
    this.logger.event('info', 'Outbox event processed', {
      operation: 'outbox_process',
      entityId: event.id,
      listingId: event.aggregateId,
      listingType: event.payload.listingType,
      resultCount: count,
      durationMs: Math.round(performance.now() - start),
      attempt: event.attempts,
    });
    return count;
  }

  private async savedSearchFanout(
    event: ListingLifecycleEvent,
  ): Promise<number> {
    const snapshot = await this.savedSearches.snapshot(
      event.payload.listingId,
      event.payload.listingType,
    );
    if (!snapshot) return 0;
    let checkpoint = event.checkpoint;
    let created = 0;
    const batch = this.config.engagement.outboxBatchSize * 4;
    for (;;) {
      const result = await this.outbox.transaction(async (manager) => {
        const candidates = await this.savedSearches.candidates(
          event.payload.listingType,
          event.occurredAt,
          checkpoint,
          batch,
          manager,
        );
        const recipientIds = [
          ...new Set(
            candidates
              .filter(
                (candidate) =>
                  candidate.userId !== event.payload.sellerId &&
                  candidate.query !== null &&
                  matchesSavedSearch(candidate.query, snapshot),
              )
              .map((candidate) => candidate.userId),
          ),
        ];
        const active = await this.users.activeIds(recipientIds, manager);
        const inserted = await this.notifications.fanout(
          'SAVED_SEARCH_MATCH',
          recipientIds.filter((id) => active.has(id)),
          event.id,
          {
            listingId: event.payload.listingId,
            listingType: event.payload.listingType,
          },
          manager,
        );
        const next = candidates.at(-1)?.id ?? null;
        if (next) await this.outbox.advance(event.id, next, manager);
        return { inserted, count: candidates.length, next };
      });
      created += result.inserted.length;
      await this.notificationRealtime.created(result.inserted);
      checkpoint = result.next;
      if (result.count < batch) return created;
    }
  }

  private async favoriteFanout(event: ListingLifecycleEvent): Promise<number> {
    let checkpoint = event.checkpoint;
    let created = 0;
    const batch = this.config.engagement.outboxBatchSize * 4;
    for (;;) {
      const result = await this.outbox.transaction(async (manager) => {
        const recipients = await this.favorites.recipients(
          event.payload.listingId,
          checkpoint,
          batch,
          manager,
        );
        const eligible = recipients.filter(
          (userId) => userId !== event.payload.sellerId,
        );
        const active = await this.users.activeIds(eligible, manager);
        const inserted = await this.notifications.fanout(
          'FAVORITE_LISTING_STATUS_CHANGED',
          eligible.filter((id) => active.has(id)),
          event.id,
          {
            listingId: event.payload.listingId,
            listingType: event.payload.listingType,
            status:
              event.type === 'LISTING_MARKED_SOLD' ? 'SOLD' : 'UNAVAILABLE',
          },
          manager,
        );
        const next = recipients.at(-1) ?? null;
        if (next) await this.outbox.advance(event.id, next, manager);
        return { inserted, count: recipients.length, next };
      });
      created += result.inserted.length;
      await this.notificationRealtime.created(result.inserted);
      checkpoint = result.next;
      if (result.count < batch) return created;
    }
  }

  private async messageNotification(
    event: MessageCreatedEvent,
  ): Promise<number> {
    const ids = await this.outbox.transaction(async (manager) => {
      const context = await this.messages.notificationContext(event, manager);
      return this.notifications.newMessage(
        context.recipientIds,
        event.id,
        {
          conversationId: event.payload.conversationId,
          messageId: event.payload.messageId,
          listingId: event.payload.listingId,
          senderPublicName: context.senderPublicName,
        },
        manager,
      );
    });
    await this.notificationRealtime.created(ids);
    return ids.length;
  }
}
