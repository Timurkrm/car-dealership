import { Inject, Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import type { EmailTemplate } from '../domain/email-delivery.types';
import { NotificationDelivery } from '../infrastructure/persistence/notification-delivery.entity';

export interface ClaimedDelivery {
  id: string;
  notificationId: string | null;
  userId: string;
  template: EmailTemplate;
  mandatory: boolean;
  recipientEmail: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: Date;
}

@Injectable()
export class EmailDeliveryRecords {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async scheduleSecurity(
    input: {
      userId: string;
      template: EmailTemplate;
      dedupeKey: string;
      recipientEmail?: string;
      payload: Record<string, unknown>;
    },
    manager: EntityManager,
  ): Promise<string> {
    const id = randomUUID();
    await manager
      .createQueryBuilder()
      .insert()
      .into(NotificationDelivery)
      .values({
        id,
        notificationId: null,
        userId: input.userId,
        channel: 'EMAIL',
        template: input.template,
        status: 'PENDING',
        mandatory: true,
        dedupeKey: input.dedupeKey,
        recipientEmail: input.recipientEmail ?? null,
        payload: { schemaVersion: 1, ...input.payload } as never,
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        sentAt: null,
        providerMessageId: null,
        lastErrorCode: null,
      })
      .orIgnore()
      .execute();
    return id;
  }

  async scheduleNotification(
    input: {
      notificationId: string;
      userId: string;
      template: EmailTemplate;
      payload: Record<string, unknown>;
      mandatory?: boolean;
    },
    manager: EntityManager,
  ): Promise<string> {
    const id = randomUUID();
    await manager
      .createQueryBuilder()
      .insert()
      .into(NotificationDelivery)
      .values({
        id,
        notificationId: input.notificationId,
        userId: input.userId,
        channel: 'EMAIL',
        template: input.template,
        status: 'PENDING',
        mandatory: input.mandatory ?? false,
        dedupeKey: `notification:${input.notificationId}:email`,
        recipientEmail: null,
        payload: { schemaVersion: 1, ...input.payload } as never,
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        sentAt: null,
        providerMessageId: null,
        lastErrorCode: null,
      })
      .orIgnore()
      .execute();
    return id;
  }
  async scheduleNotifications(
    inputs: ReadonlyArray<{
      notificationId: string;
      userId: string;
      template: EmailTemplate;
      payload: Record<string, unknown>;
      mandatory?: boolean;
    }>,
    manager: EntityManager,
  ): Promise<void> {
    if (!inputs.length) return;
    await manager
      .createQueryBuilder()
      .insert()
      .into(NotificationDelivery)
      .values(
        inputs.map((input) => ({
          id: randomUUID(),
          notificationId: input.notificationId,
          userId: input.userId,
          channel: 'EMAIL' as const,
          template: input.template,
          status: 'PENDING' as const,
          mandatory: input.mandatory ?? false,
          dedupeKey: `notification:${input.notificationId}:email`,
          recipientEmail: null,
          payload: { schemaVersion: 1, ...input.payload } as never,
          attempts: 0,
          availableAt: new Date(),
          lockedAt: null,
          sentAt: null,
          providerMessageId: null,
          lastErrorCode: null,
        })),
      )
      .orIgnore()
      .execute();
  }

  async suppressPending(
    userId: string,
    template: EmailTemplate,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE notification_deliveries SET status = 'SUPPRESSED', locked_at = NULL,
       last_error_code = 'REPLACED', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND template = $2 AND status IN ('PENDING','RETRY')`,
      [userId, template],
    );
  }

  async claim(
    limit = this.config.emailDelivery.batchSize,
  ): Promise<ClaimedDelivery[]> {
    const leaseSeconds = this.config.emailDelivery.leaseSeconds;
    return this.database.source.transaction(async (manager) => {
      await manager.query(
        `UPDATE notification_deliveries
         SET status = 'RETRY', locked_at = NULL, available_at = CURRENT_TIMESTAMP,
             last_error_code = 'WORKER_LEASE_EXPIRED', updated_at = CURRENT_TIMESTAMP
         WHERE status = 'PROCESSING' AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second')`,
        [leaseSeconds],
      );
      const result: ClaimedDelivery[] | [ClaimedDelivery[], number] =
        await manager.query(
          `WITH candidates AS (
           SELECT id FROM notification_deliveries
           WHERE status IN ('PENDING','RETRY') AND available_at <= CURRENT_TIMESTAMP
           ORDER BY available_at, created_at, id
           LIMIT $1 FOR UPDATE SKIP LOCKED
         )
         UPDATE notification_deliveries delivery
         SET status = 'PROCESSING', locked_at = CURRENT_TIMESTAMP,
             attempts = delivery.attempts + 1, updated_at = CURRENT_TIMESTAMP
         FROM candidates WHERE delivery.id = candidates.id
         RETURNING delivery.id, delivery.notification_id AS "notificationId",
           delivery.user_id AS "userId", delivery.template, delivery.mandatory,
           delivery.recipient_email AS "recipientEmail", delivery.payload,
           delivery.attempts, delivery.created_at AS "createdAt"`,
          [limit],
        );
      // TypeORM's PostgreSQL query runner returns [rows, affected] for
      // UPDATE ... RETURNING, while SELECT queries return rows directly.
      if (Array.isArray(result[0])) return result[0];
      return result as ClaimedDelivery[];
    });
  }

  async sent(id: string, providerMessageId: string | null): Promise<void> {
    await this.database.source.query(
      `UPDATE notification_deliveries SET status='SENT', sent_at=CURRENT_TIMESTAMP,
       locked_at=NULL, provider_message_id=$2, last_error_code=NULL,
       updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PROCESSING'`,
      [id, providerMessageId],
    );
  }
  async previewSent(
    id: string,
    providerMessageId: string | null,
  ): Promise<void> {
    await this.database.source.query(
      `UPDATE notification_deliveries SET status='SENT', sent_at=CURRENT_TIMESTAMP,
       provider_message_id=$2, last_error_code=NULL, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='PENDING'`,
      [id, providerMessageId],
    );
  }
  async suppress(id: string, code: string): Promise<void> {
    await this.terminal(id, 'SUPPRESSED', code);
  }
  async fail(id: string, code: string): Promise<void> {
    await this.terminal(id, 'FAILED', code);
  }
  private async terminal(
    id: string,
    status: 'FAILED' | 'SUPPRESSED',
    code: string,
  ): Promise<void> {
    await this.database.source.query(
      `UPDATE notification_deliveries SET status=$2, locked_at=NULL,
       last_error_code=$3, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='PROCESSING'`,
      [id, status, code],
    );
  }
  async retry(
    delivery: Pick<ClaimedDelivery, 'id' | 'attempts'>,
    code: string,
    retryAfterSeconds?: number,
  ): Promise<void> {
    if (delivery.attempts >= this.config.emailDelivery.maxAttempts) {
      await this.fail(delivery.id, 'EMAIL_MAX_ATTEMPTS');
      return;
    }
    const exponential = Math.min(3600, 15 * 2 ** (delivery.attempts - 1));
    const jitter = randomInt(
      0,
      Math.max(2, Math.floor(Math.min(exponential, 600) / 4) + 1),
    );
    const delay = Math.min(
      3600,
      Math.max(exponential + jitter, retryAfterSeconds ?? 0),
    );
    await this.database.source.query(
      `UPDATE notification_deliveries SET status='RETRY', locked_at=NULL,
       available_at=CURRENT_TIMESTAMP + ($2 * INTERVAL '1 second'),
       last_error_code=$3, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='PROCESSING'`,
      [delivery.id, delay, code],
    );
  }
  retryFailed(id?: string): Promise<unknown> {
    return this.database.source.query(
      `UPDATE notification_deliveries SET status='RETRY', attempts=0,
       available_at=CURRENT_TIMESTAMP, locked_at=NULL, last_error_code=NULL,
       updated_at=CURRENT_TIMESTAMP
       WHERE status='FAILED' AND ($1::uuid IS NULL OR id=$1)`,
      [id ?? null],
    );
  }
  async depth(): Promise<{ pending: number; oldestSeconds: number | null }> {
    const rows: Array<{ pending: number; oldestSeconds: number | null }> =
      await this.database.source.query(
        `SELECT COUNT(*)::integer AS pending,
         EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(created_at)))::integer AS "oldestSeconds"
         FROM notification_deliveries WHERE status IN ('PENDING','RETRY')`,
      );
    return rows[0] ?? { pending: 0, oldestSeconds: null };
  }
}
