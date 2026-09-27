import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ObjectStorage } from '../../../platform/storage/object-storage';
import { ListingAccess } from '../../listings';
import { AuditWriter } from '../../audit';
import { ListingMedia } from '../infrastructure/persistence/listing-media.entity';
import { MediaVariant } from '../infrastructure/persistence/media-variant.entity';
import { mediaPrefix } from '../domain/media-policy';
import { MediaProcessingQueue } from '../infrastructure/queue/media-queue';
import { StructuredLogger } from '../../../platform/logging/structured-logger';
@Injectable()
export class MediaCleanup {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    @Inject(ListingAccess) private readonly listings: ListingAccess,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(MediaProcessingQueue) private readonly queue: MediaProcessingQueue,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}
  async dispatch(): Promise<void> {
    const rows = await this.database.source
      .getRepository(ListingMedia)
      .createQueryBuilder('media')
      .where(
        "((media.status IN ('UPLOADED','PROCESSING','READY','FAILED','DELETED') AND (media.dispatchAt IS NULL OR media.dispatchAt <= CURRENT_TIMESTAMP)) OR (media.status = 'PENDING' AND media.uploadExpiresAt <= CURRENT_TIMESTAMP))",
      )
      .orderBy('media.updatedAt', 'ASC')
      .limit(50)
      .getMany();
    for (const row of rows) {
      if (row.status === 'UPLOADED' || row.status === 'PROCESSING')
        await this.queue.enqueue(row.id);
      else await this.queue.enqueueCleanup(row.id);
      await this.database.source
        .createQueryBuilder()
        .update(ListingMedia)
        .set({ dispatchAt: new Date(Date.now() + 30000) })
        .where('id = :id AND status = :status', {
          id: row.id,
          status: row.status,
        })
        .execute();
    }
  }
  async cleanup(id: string): Promise<void> {
    const row = await this.database.source.transaction(async (manager) => {
      const found = await manager.findOneBy(ListingMedia, { id });
      if (!found) return null;
      await this.listings.lockForMedia(found.listingId, manager);
      const current = await manager
        .getRepository(ListingMedia)
        .createQueryBuilder('media')
        .addSelect('media.storageKey')
        .where({ id })
        .getOne();
      if (
        !current ||
        (current.leaseUntil && current.leaseUntil.getTime() > Date.now())
      )
        return null;
      if (
        current.status === 'PENDING' &&
        current.uploadExpiresAt &&
        current.uploadExpiresAt.getTime() <= Date.now()
      ) {
        await manager.update(ListingMedia, id, {
          status: 'DELETED',
          isPrimary: false,
        });
        current.status = 'DELETED';
        await this.audit.append(
          {
            action: 'LISTING_MEDIA_DELETED',
            actorUserId: null,
            targetType: 'LISTING_MEDIA',
            targetId: id,
            requestId: null,
            metadata: { reasonCode: 'UPLOAD_EXPIRED' },
          },
          manager,
        );
      }
      return ['READY', 'FAILED', 'DELETED'].includes(current.status)
        ? current
        : null;
    });
    if (!row) return;
    // A PUT authorization can be replayed until its expiry. Revisit after expiry plus clock-skew grace.
    const safeAt =
      Math.max(
        row.uploadExpiresAt?.getTime() ?? 0,
        row.leaseUntil?.getTime() ?? 0,
      ) + 60000;
    if (safeAt > Date.now()) {
      await this.database.source.manager.update(ListingMedia, id, {
        dispatchAt: new Date(safeAt),
      });
      return;
    }
    const variants = await this.database.source
      .getRepository(MediaVariant)
      .createQueryBuilder('variant')
      .addSelect('variant.storageKey')
      .where({ mediaId: id })
      .getMany();
    const retained = new Set(
      row.status === 'READY' ? variants.map((v) => v.storageKey) : [],
    );
    for (const key of await this.storage.keys(mediaPrefix(id)))
      if (!retained.has(key)) await this.storage.delete(key);
    // Legacy sources are not under the generated prefix, but the key is a persisted owned reference.
    if (!retained.has(row.storageKey))
      await this.storage.delete(row.storageKey);
    if (row.status !== 'READY')
      await this.database.source.manager.delete(MediaVariant, { mediaId: id });
    // Tombstones are retained and revisited, covering a late write by a stale processing attempt.
    await this.database.source.manager.update(ListingMedia, id, {
      dispatchAt: new Date(Date.now() + 86400000),
    });
    this.logger.event('info', 'Media cleanup completed', {
      operation: 'media_cleanup',
      entityId: id,
      listingId: row.listingId,
    });
  }
}
