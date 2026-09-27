import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { ObjectStorage } from '../../../platform/storage/object-storage';
import { ApiException } from '../../../platform/http/api-error';
import { requestContext } from '../../../platform/http/request-context';
import { ListingAccess } from '../../listings';
import { AuditWriter } from '../../audit';
import { ListingMedia } from '../infrastructure/persistence/listing-media.entity';
import { MediaReadService } from './media-read';
import {
  editableMedia,
  sourceKey,
  validateUpload,
} from '../domain/media-policy';
import { MediaProcessingQueue } from '../infrastructure/queue/media-queue';
export function mediaNotFound(): ApiException {
  return new ApiException(404, 'MEDIA_NOT_FOUND', 'Photo not found');
}
@Injectable()
export class MediaCommands {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    @Inject(ListingAccess) private readonly listings: ListingAccess,
    @Inject(MediaReadService) private readonly reads: MediaReadService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(MediaProcessingQueue) private readonly queue: MediaProcessingQueue,
  ) {}
  async list(id: string, actor: string) {
    return this.database.source.transaction(
      'REPEATABLE READ',
      async (manager) => {
        await this.listings.owned(id, actor, manager);
        return {
          items: (await this.reads.readMany([id], manager, true)).get(id) ?? [],
          limits: {
            maxImages: this.config.media.maxImages,
            maxFileSize: this.config.media.maxFileSize,
            supportedTypes: ['image/jpeg', 'image/png', 'image/webp'],
          },
        };
      },
    );
  }
  async initialize(
    id: string,
    actor: string,
    input: { sizeBytes: number; contentType: string },
  ) {
    validateUpload(input.sizeBytes, input.contentType, this.config.media);
    const mediaId = randomUUID(),
      key = sourceKey(mediaId);
    const expiresAt = new Date(Date.now() + this.config.media.uploadTtl * 1000);
    await this.database.source.transaction(async (manager) => {
      const listing = await this.listings.owned(id, actor, manager, true);
      editableMedia(listing.status);
      const rows = await this.active(id, manager);
      if (rows.length >= this.config.media.maxImages)
        throw new ApiException(
          409,
          'MEDIA_LIMIT_EXCEEDED',
          'Maximum number of photos reached',
        );
      const sortOrder = rows.length
        ? Math.max(...rows.map((row) => row.sortOrder)) + 1
        : 0;
      await manager.insert(ListingMedia, {
        id: mediaId,
        listingId: id,
        storageKey: key,
        sortOrder,
        status: 'PENDING',
        uploadExpiresAt: expiresAt,
      });
      await this.record(
        'LISTING_MEDIA_UPLOAD_INITIALIZED',
        mediaId,
        actor,
        manager,
      );
    });
    try {
      return {
        mediaId,
        upload: {
          method: 'PUT' as const,
          url: await this.storage.uploadUrl(
            key,
            input.contentType,
            this.config.media.uploadTtl,
          ),
          headers: { 'Content-Type': input.contentType },
          expiresAt: expiresAt.toISOString(),
        },
      };
    } catch {
      throw new ApiException(
        503,
        'MEDIA_STORAGE_UNAVAILABLE',
        'Photo storage temporarily unavailable',
      );
    }
  }
  async complete(id: string, mediaId: string, actor: string) {
    const initial = await this.database.source.transaction(async (manager) => {
      const listing = await this.listings.owned(id, actor, manager);
      editableMedia(listing.status);
      return this.media(id, mediaId, manager);
    });
    if (initial.status === 'PENDING') {
      if (
        !initial.uploadExpiresAt ||
        initial.uploadExpiresAt.getTime() <= Date.now()
      )
        throw new ApiException(
          409,
          'MEDIA_UPLOAD_EXPIRED',
          'Upload authorization expired; delete this photo and upload again',
        );
      let object: { size: number; etag: string } | null;
      try {
        object = await this.storage.head(initial.storageKey);
      } catch {
        throw new ApiException(
          503,
          'MEDIA_STORAGE_UNAVAILABLE',
          'Photo storage temporarily unavailable',
        );
      }
      if (!object)
        throw new ApiException(
          400,
          'MEDIA_OBJECT_NOT_FOUND',
          'Upload the photo before confirming',
        );
      if (object.size < 1 || object.size > this.config.media.maxFileSize) {
        const failureCode =
          object.size < 1 ? 'INVALID_IMAGE' : 'IMAGE_TOO_LARGE';
        await this.database.source.transaction(async (manager) => {
          const listing = await this.listings.owned(id, actor, manager, true);
          editableMedia(listing.status);
          const row = await this.media(id, mediaId, manager);
          if (row.status === 'PENDING') {
            await manager.update(ListingMedia, row.id, {
              status: 'FAILED',
              failureCode,
              dispatchAt: new Date(),
            });
            await this.record(
              'LISTING_MEDIA_FAILED',
              row.id,
              actor,
              manager,
              failureCode,
            );
          }
        });
        throw new ApiException(
          400,
          object.size < 1 ? 'MEDIA_INVALID_IMAGE' : 'MEDIA_FILE_TOO_LARGE',
          object.size < 1
            ? 'Photo is empty'
            : 'Photo exceeds the upload size limit',
        );
      }
      await this.database.source.transaction(async (manager) => {
        const listing = await this.listings.owned(id, actor, manager, true);
        editableMedia(listing.status);
        const row = await this.media(id, mediaId, manager);
        if (row.status !== 'PENDING') return;
        if (!row.uploadExpiresAt || row.uploadExpiresAt.getTime() <= Date.now())
          throw new ApiException(
            409,
            'MEDIA_UPLOAD_EXPIRED',
            'Upload authorization expired',
          );
        await manager.update(ListingMedia, row.id, {
          status: 'UPLOADED',
          sourceSize: object.size,
          sourceEtag: object.etag,
          dispatchAt: new Date(),
        });
      });
    } else if (
      !['UPLOADED', 'PROCESSING', 'READY', 'FAILED'].includes(initial.status)
    )
      throw new ApiException(
        409,
        'MEDIA_INVALID_STATE',
        'Photo cannot be completed',
      );
    // The row is the durable outbox; the worker also redispatches it if Redis is unavailable.
    if (
      await this.database.source.manager.existsBy(ListingMedia, {
        id: mediaId,
        status: 'UPLOADED',
      })
    )
      await this.queue.enqueueBestEffort(mediaId);
    return this.list(id, actor);
  }
  async reorder(id: string, actor: string, ids: string[]) {
    await this.database.source.transaction(async (manager) => {
      const listing = await this.listings.owned(id, actor, manager, true);
      editableMedia(listing.status);
      const rows = await this.active(id, manager);
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== rows.length ||
        rows.some((row) => !ids.includes(row.id))
      )
        throw new ApiException(
          400,
          'MEDIA_INVALID_ORDER',
          'Include every current photo exactly once',
        );
      // All temporary positions are above the current maximum, so swaps satisfy the immediate unique index.
      const base = rows.length
        ? Math.max(...rows.map((row) => row.sortOrder)) + 1
        : 0;
      for (let index = 0; index < ids.length; index++)
        await manager.update(ListingMedia, ids[index]!, {
          sortOrder: base + index,
        });
      for (let index = 0; index < ids.length; index++)
        await manager.update(ListingMedia, ids[index]!, { sortOrder: index });
      await this.record('LISTING_MEDIA_REORDERED', id, actor, manager);
    });
    return this.list(id, actor);
  }
  async primary(id: string, mediaId: string, actor: string) {
    await this.database.source.transaction(async (manager) => {
      const listing = await this.listings.owned(id, actor, manager, true);
      editableMedia(listing.status);
      const row = await this.media(id, mediaId, manager);
      if (row.status !== 'READY')
        throw new ApiException(
          409,
          'MEDIA_NOT_READY',
          'Only processed photos can be primary',
        );
      await manager.update(
        ListingMedia,
        { listingId: id, isPrimary: true },
        { isPrimary: false },
      );
      await manager.update(ListingMedia, row.id, { isPrimary: true });
      await this.record(
        'LISTING_MEDIA_PRIMARY_CHANGED',
        row.id,
        actor,
        manager,
      );
    });
    return this.list(id, actor);
  }
  async delete(id: string, mediaId: string, actor: string) {
    await this.database.source.transaction(async (manager) => {
      const listing = await this.listings.owned(id, actor, manager, true);
      editableMedia(listing.status);
      const row = await this.media(id, mediaId, manager, true);
      if (row.status === 'DELETED') return;
      await manager.update(ListingMedia, row.id, {
        status: 'DELETED',
        isPrimary: false,
        dispatchAt: new Date(),
      });
      if (row.isPrimary) {
        const next = (await this.active(id, manager)).find(
          (media) => media.status === 'READY',
        );
        if (next)
          await manager.update(ListingMedia, next.id, { isPrimary: true });
      }
      await this.record('LISTING_MEDIA_DELETED', row.id, actor, manager);
    });
    return this.list(id, actor);
  }
  private active(id: string, manager: EntityManager) {
    return manager
      .getRepository(ListingMedia)
      .createQueryBuilder('media')
      .where("media.listingId = :id AND media.status <> 'DELETED'", { id })
      .orderBy('media.sortOrder', 'ASC')
      .addOrderBy('media.id', 'ASC')
      .getMany();
  }
  private async media(
    id: string,
    mediaId: string,
    manager: EntityManager,
    deleted = false,
  ) {
    const row = await manager
      .getRepository(ListingMedia)
      .createQueryBuilder('media')
      .addSelect('media.storageKey')
      .where({ id: mediaId, listingId: id })
      .getOne();
    if (!row || (!deleted && row.status === 'DELETED')) throw mediaNotFound();
    return row;
  }
  private record(
    action: string,
    targetId: string,
    actorUserId: string,
    manager: EntityManager,
    reasonCode?: string,
  ) {
    return this.audit.append(
      {
        action,
        targetId,
        actorUserId,
        targetType:
          action === 'LISTING_MEDIA_REORDERED' ? 'LISTING' : 'LISTING_MEDIA',
        requestId: requestContext.getStore()?.requestId ?? null,
        metadata: reasonCode ? { reasonCode } : {},
      },
      manager,
    );
  }
}
