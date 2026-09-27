import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import type {
  ListingLifecycleEvent,
  OutboxDomainEvent,
} from '../domain/outbox.types';
import {
  parseListingLifecyclePayload,
  parseMessageCreatedPayload,
} from '../domain/outbox.types';
import { OutboxEvent } from '../infrastructure/persistence/outbox-event.entity';

interface ClaimedRow {
  id: string;
  type: OutboxDomainEvent['type'];
  aggregate_type: OutboxDomainEvent['aggregateType'];
  aggregate_id: string;
  payload: unknown;
  occurred_at: Date;
  attempts: number;
  checkpoint: string | null;
}

@Injectable()
export class OutboxRecords {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.database.source.transaction(work);
  }

  async claim(): Promise<OutboxDomainEvent[]> {
    return this.transaction(async (manager) => {
      const lease = this.config.engagement.outboxLeaseSeconds;
      const max = this.config.engagement.outboxMaxAttempts;
      await manager.query(
        `UPDATE outbox_events
         SET status = 'FAILED', locked_at = NULL, last_error_code = 'OUTBOX_ATTEMPTS_EXHAUSTED'
         WHERE status = 'PROCESSING'
           AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')
           AND attempts >= $2`,
        [lease, max],
      );
      const raw: unknown = await manager.query(
        `WITH candidates AS (
           SELECT id
           FROM outbox_events
           WHERE attempts < $2
             AND (
               (status IN ('PENDING', 'RETRY') AND available_at <= CURRENT_TIMESTAMP)
               OR (status = 'PROCESSING' AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second'))
             )
           ORDER BY available_at ASC, id ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $3
         )
         UPDATE outbox_events event
         SET status = 'PROCESSING', locked_at = CURRENT_TIMESTAMP,
             attempts = event.attempts + 1, last_error_code = NULL
         FROM candidates
         WHERE event.id = candidates.id
         RETURNING event.id, event.type, event.aggregate_type, event.aggregate_id,
                   event.payload, event.occurred_at, event.attempts, event.checkpoint`,
        [lease, max, this.config.engagement.outboxBatchSize],
      );
      const rows = driverRows<ClaimedRow>(raw);
      const events: OutboxDomainEvent[] = [];
      for (const row of rows) {
        try {
          if (row.type === 'MESSAGE_CREATED') {
            const payload = parseMessageCreatedPayload(row.payload);
            if (
              row.aggregate_type !== 'MESSAGE' ||
              row.aggregate_id !== payload.messageId
            )
              throw new Error('OUTBOX_INVALID_PAYLOAD');
            events.push({
              id: row.id,
              type: row.type,
              aggregateType: row.aggregate_type,
              aggregateId: row.aggregate_id,
              payload,
              occurredAt: new Date(row.occurred_at),
              attempts: row.attempts,
              checkpoint: row.checkpoint,
            });
            continue;
          }
          const payload = parseListingLifecyclePayload(row.payload);
          if (
            row.aggregate_type !== 'LISTING' ||
            row.aggregate_id !== payload.listingId ||
            !eventStatusMatches(row.type, payload.nextStatus)
          )
            throw new Error('OUTBOX_INVALID_PAYLOAD');
          events.push({
            id: row.id,
            type: row.type,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            payload,
            occurredAt: new Date(row.occurred_at),
            attempts: row.attempts,
            checkpoint: row.checkpoint,
          });
        } catch {
          await manager.update(
            OutboxEvent,
            { id: row.id, status: 'PROCESSING' },
            {
              status: 'FAILED',
              lockedAt: null,
              lastErrorCode: 'OUTBOX_INVALID_PAYLOAD',
            },
          );
        }
      }
      return events;
    });
  }

  async advance(
    id: string,
    checkpoint: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(
      OutboxEvent,
      { id, status: 'PROCESSING' },
      { checkpoint },
    );
  }

  async complete(id: string): Promise<void> {
    await this.database.source.manager.update(
      OutboxEvent,
      { id, status: 'PROCESSING' },
      {
        status: 'PROCESSED',
        processedAt: new Date(),
        lockedAt: null,
        lastErrorCode: null,
      },
    );
  }

  async fail(
    event: Pick<OutboxDomainEvent, 'id' | 'attempts'>,
    errorCode: string,
    permanent = false,
  ): Promise<void> {
    const terminal =
      permanent || event.attempts >= this.config.engagement.outboxMaxAttempts;
    const baseDelay = Math.min(3600, 2 ** Math.min(event.attempts, 10));
    const delaySeconds = Math.min(
      3600,
      baseDelay + randomInt(0, Math.max(2, Math.floor(baseDelay / 4) + 1)),
    );
    await this.database.source.manager.update(
      OutboxEvent,
      { id: event.id, status: 'PROCESSING' },
      {
        status: terminal ? 'FAILED' : 'RETRY',
        lockedAt: null,
        availableAt: terminal
          ? new Date()
          : new Date(Date.now() + delaySeconds * 1000),
        lastErrorCode: errorCode.slice(0, 64),
      },
    );
  }

  async recoverFailed(id?: string): Promise<number> {
    const result = await this.database.source
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({
        status: 'RETRY',
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        lastErrorCode: null,
      })
      .where("status = 'FAILED'")
      .andWhere(id ? 'id = :id' : 'TRUE', id ? { id } : {})
      .execute();
    return result.affected ?? 0;
  }
}

function eventStatusMatches(
  type: ListingLifecycleEvent['type'],
  nextStatus: ListingLifecycleEvent['payload']['nextStatus'],
): boolean {
  if (type === 'LISTING_PUBLISHED') return nextStatus === 'PUBLISHED';
  if (type === 'LISTING_MARKED_SOLD') return nextStatus === 'SOLD';
  return nextStatus === 'ARCHIVED';
}

function driverRows<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new Error('OUTBOX_QUERY_FAILED');
  return Array.isArray(value[0]) ? (value[0] as T[]) : (value as T[]);
}
