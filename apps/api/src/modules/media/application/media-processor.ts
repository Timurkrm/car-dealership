import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import {
  ObjectStorage,
  ObjectChanged,
} from '../../../platform/storage/object-storage';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { StructuredLogger } from '../../../platform/logging/structured-logger';
import { AuditWriter } from '../../audit';
import { ListingAccess } from '../../listings';
import { ListingMedia } from '../infrastructure/persistence/listing-media.entity';
import { MediaVariant } from '../infrastructure/persistence/media-variant.entity';
import { ImageProcessor } from '../infrastructure/image/image-processor';
import {
  InvalidImage,
  LEASE_MS,
  PROCESSING_ATTEMPTS,
  variantKey,
} from '../domain/media-policy';
@Injectable()
export class MediaProcessor {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    @Inject(ListingAccess) private readonly listings: ListingAccess,
    @Inject(ImageProcessor) private readonly image: ImageProcessor,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
  ) {}
  async process(id: string): Promise<void> {
    const started = Date.now();
    const claim = await this.database.source.transaction(async (manager) => {
      const found = await manager.findOneBy(ListingMedia, { id });
      if (!found) return null;
      await this.listings.lockForMedia(found.listingId, manager);
      const row = await manager
        .getRepository(ListingMedia)
        .createQueryBuilder('media')
        .addSelect([
          'media.storageKey',
          'media.sourceEtag',
          'media.processingToken',
        ])
        .where({ id })
        .getOne();
      if (
        !row ||
        !['UPLOADED', 'PROCESSING'].includes(row.status) ||
        (row.leaseUntil && row.leaseUntil.getTime() > Date.now())
      )
        return null;
      if (row.attempts >= PROCESSING_ATTEMPTS) {
        await manager.update(ListingMedia, id, {
          status: 'FAILED',
          failureCode: 'PROCESSING_FAILED',
          processingToken: null,
          leaseUntil: null,
          dispatchAt: new Date(),
        });
        await this.audit.append(
          {
            action: 'LISTING_MEDIA_FAILED',
            actorUserId: null,
            targetType: 'LISTING_MEDIA',
            targetId: id,
            requestId: null,
            metadata: { reasonCode: 'PROCESSING_FAILED' },
          },
          manager,
        );
        return null;
      }
      const token = randomUUID();
      await manager.update(ListingMedia, id, {
        status: 'PROCESSING',
        processingToken: token,
        leaseUntil: new Date(Date.now() + LEASE_MS),
        attempts: row.attempts + 1,
        dispatchAt: new Date(Date.now() + LEASE_MS),
      });
      return { ...row, token, attempt: row.attempts + 1 };
    });
    if (!claim) return;
    try {
      if (!claim.sourceEtag) throw new InvalidImage('INVALID_IMAGE');
      const bytes = await this.storage.readBounded(
        claim.storageKey,
        this.config.media.maxFileSize,
        claim.sourceEtag,
      );
      const output = await this.image.process(bytes);
      const variants: MediaVariant[] = [];
      for (const variant of output.variants) {
        const key = variantKey(id, claim.token, variant.kind);
        await this.storage.putVariant(key, variant.bytes);
        variants.push(
          Object.assign(new MediaVariant(), {
            mediaId: id,
            kind: variant.kind,
            storageKey: key,
            width: variant.width,
            height: variant.height,
            size: variant.size,
          }),
        );
      }
      await this.database.source.transaction(async (manager) => {
        await this.listings.lockForMedia(claim.listingId, manager);
        const result = await manager
          .createQueryBuilder()
          .update(ListingMedia)
          .set({
            status: 'READY',
            detectedFormat: output.format,
            width: output.width,
            height: output.height,
            processedAt: new Date(),
            processingToken: null,
            leaseUntil: null,
            dispatchAt: new Date(),
          })
          .where(
            "id = :id AND status = 'PROCESSING' AND processing_token = :token",
            { id, token: claim.token },
          )
          .execute();
        if (result.affected !== 1) return;
        await manager.insert(MediaVariant, variants);
        if (
          !(await manager.existsBy(ListingMedia, {
            listingId: claim.listingId,
            isPrimary: true,
          }))
        )
          await manager.update(ListingMedia, id, { isPrimary: true });
        await this.audit.append(
          {
            action: 'LISTING_MEDIA_READY',
            actorUserId: null,
            targetType: 'LISTING_MEDIA',
            targetId: id,
            requestId: null,
            metadata: { nextStatus: 'READY' },
          },
          manager,
        );
      });
      this.logger.event('info', 'Media processing completed', {
        operation: 'media_process',
        entityId: id,
        listingId: claim.listingId,
        durationMs: Date.now() - started,
        attempt: claim.attempt,
        detectedFormat: output.format,
        outputBytes: variants.reduce((sum, v) => sum + v.size, 0),
      });
    } catch (error) {
      const invalid =
        error instanceof InvalidImage || error instanceof ObjectChanged;
      const permanent = invalid || claim.attempt >= PROCESSING_ATTEMPTS;
      const code =
        error instanceof InvalidImage
          ? error.code
          : error instanceof ObjectChanged
            ? 'SOURCE_CHANGED'
            : 'PROCESSING_FAILED';
      await this.database.source.transaction(async (manager) => {
        await this.listings.lockForMedia(claim.listingId, manager);
        const result = await manager
          .createQueryBuilder()
          .update(ListingMedia)
          .set({
            status: permanent ? 'FAILED' : 'UPLOADED',
            failureCode: permanent ? code : null,
            processingToken: null,
            leaseUntil: null,
            dispatchAt: new Date(Date.now() + 1000 * 2 ** (claim.attempt - 1)),
          })
          .where(
            "id = :id AND status = 'PROCESSING' AND processing_token = :token",
            { id, token: claim.token },
          )
          .execute();
        if (result.affected === 1 && permanent)
          await this.audit.append(
            {
              action: 'LISTING_MEDIA_FAILED',
              actorUserId: null,
              targetType: 'LISTING_MEDIA',
              targetId: id,
              requestId: null,
              metadata: { reasonCode: code },
            },
            manager,
          );
      });
      this.logger.event('warn', 'Media processing failed', {
        operation: 'media_process',
        entityId: id,
        listingId: claim.listingId,
        attempt: claim.attempt,
        durationMs: Date.now() - started,
        errorType: code,
      });
      if (!permanent)
        throw new Error('Retryable media storage failure', { cause: error });
    }
  }
}
