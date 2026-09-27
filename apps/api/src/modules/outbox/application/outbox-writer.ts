import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type {
  ListingLifecycleEventPayload,
  MessageCreatedEventPayload,
  OutboxEventType,
} from '../domain/outbox.types';
import { parseListingLifecyclePayload } from '../domain/outbox.types';
import { parseMessageCreatedPayload } from '../domain/outbox.types';
import { OutboxEvent } from '../infrastructure/persistence/outbox-event.entity';

@Injectable()
export class OutboxWriter {
  async listingLifecycle(
    type: OutboxEventType,
    payload: ListingLifecycleEventPayload,
    manager: EntityManager,
  ): Promise<string> {
    const safe = parseListingLifecyclePayload(payload);
    const id = randomUUID();
    const now = new Date();
    await manager.insert(OutboxEvent, {
      id,
      type,
      aggregateType: 'LISTING',
      aggregateId: safe.listingId,
      payload: safe as never,
      occurredAt: now,
      status: 'PENDING',
      attempts: 0,
      availableAt: now,
      lockedAt: null,
      processedAt: null,
      checkpoint: null,
      lastErrorCode: null,
    });
    return id;
  }

  async messageCreated(
    payload: MessageCreatedEventPayload,
    manager: EntityManager,
  ): Promise<string> {
    const safe = parseMessageCreatedPayload(payload);
    const id = randomUUID();
    const now = new Date();
    await manager.insert(OutboxEvent, {
      id,
      type: 'MESSAGE_CREATED',
      aggregateType: 'MESSAGE',
      aggregateId: safe.messageId,
      payload: safe as never,
      occurredAt: now,
      status: 'PENDING',
      attempts: 0,
      availableAt: now,
      lockedAt: null,
      processedAt: null,
      checkpoint: null,
      lastErrorCode: null,
    });
    return id;
  }
}
