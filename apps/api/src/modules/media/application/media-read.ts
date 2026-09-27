import { Inject, Injectable, Module } from '@nestjs/common';
import { MediaSearchProjection } from './media-search-projection';
import { In } from 'typeorm';
import type { EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { PlatformModule } from '../../../platform/platform.module';
import { ObjectStorage } from '../../../platform/storage/object-storage';
import { ApiException } from '../../../platform/http/api-error';
import { ListingMediaPort } from '../../listings';
import type {
  ListingImageResponse,
  ImageVariantsResponse,
} from '../../listings';
import { ListingMedia } from '../infrastructure/persistence/listing-media.entity';
import { MediaVariant } from '../infrastructure/persistence/media-variant.entity';
@Injectable()
export class MediaReadService extends ListingMediaPort {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    @Inject(MediaSearchProjection)
    private readonly projection: MediaSearchProjection,
  ) {
    super();
  }
  attachReadyPrimary<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
  ): void {
    this.projection.attach(query);
  }
  async readMany(
    ids: string[],
    manager: EntityManager,
    owner = false,
    coverOnly = false,
  ): Promise<Map<string, ListingImageResponse[]>> {
    const result = new Map<string, ListingImageResponse[]>();
    if (!ids.length) return result;
    const builder = manager
      .getRepository(ListingMedia)
      .createQueryBuilder('media')
      .where('media.listingId IN (:...ids)', { ids })
      .andWhere(owner ? "media.status <> 'DELETED'" : "media.status = 'READY'")
      .orderBy('media.sortOrder', 'ASC')
      .addOrderBy('media.id', 'ASC');
    if (coverOnly) builder.andWhere('media.isPrimary = true');
    const rows = await builder.getMany();
    const ready = rows.filter((row) => row.status === 'READY');
    const variants = await manager
      .getRepository(MediaVariant)
      .createQueryBuilder('variant')
      .addSelect('variant.storageKey')
      .where({ mediaId: In(ready.map((row) => row.id)) })
      .getMany();
    // Signing GET URLs is local cryptography, with no per-image storage network request.
    for (const row of rows) {
      const available = variants.filter(
        (variant) => variant.mediaId === row.id,
      );
      const byKind = new Map(available.map((v) => [v.kind, v]));
      let urls: ImageVariantsResponse | null = null;
      if (byKind.size === 3) {
        const resolve = async (kind: MediaVariant['kind']) => {
          const variant = byKind.get(kind);
          if (!variant) throw new Error('Missing variant');
          return {
            url: await this.storage.readUrl(
              variant.storageKey,
              this.config.media.readTtl,
            ),
            width: variant.width,
            height: variant.height,
          };
        };
        urls = {
          thumbnail: await resolve('thumbnail'),
          medium: await resolve('medium'),
          large: await resolve('large'),
        };
      }
      if (!owner && !urls) continue;
      const item: ListingImageResponse = {
        id: row.id,
        status: row.status,
        sortOrder: row.sortOrder,
        isPrimary: row.isPrimary,
        failureCode: owner ? row.failureCode : null,
        width: row.width,
        height: row.height,
        variants: urls,
      };
      const group = result.get(row.listingId) ?? [];
      group.push(item);
      result.set(row.listingId, group);
    }
    return result;
  }
  async assertSubmissionReady(
    id: string,
    manager: EntityManager,
  ): Promise<void> {
    const primary = await manager.findOneBy(ListingMedia, {
      listingId: id,
      status: 'READY',
      isPrimary: true,
    });
    const count = primary
      ? await manager.countBy(MediaVariant, { mediaId: primary.id })
      : 0;
    const pending = await manager
      .getRepository(ListingMedia)
      .createQueryBuilder('media')
      .where('media.listingId = :id AND media.status IN (:...statuses)', {
        id,
        statuses: ['PENDING', 'UPLOADED', 'PROCESSING'],
      })
      .getCount();
    if (!primary || count !== 3 || pending)
      throw new ApiException(
        400,
        'LISTING_INCOMPLETE',
        'At least one processed primary photo is required; finish or delete pending uploads before submission',
      );
  }
}
@Module({
  imports: [PlatformModule],
  providers: [MediaReadService, MediaSearchProjection],
  exports: [MediaReadService, MediaSearchProjection],
})
export class MediaReadModule {}
