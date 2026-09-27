import { Inject, Injectable } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ObjectStorage } from '../../../platform/storage/object-storage';
import { ListingMedia } from '../infrastructure/persistence/listing-media.entity';
import { MediaVariant } from '../infrastructure/persistence/media-variant.entity';

export interface SearchImage {
  url: string;
  width: number;
  height: number;
}
@Injectable()
export class MediaSearchProjection {
  constructor(
    @Inject(ObjectStorage) private readonly storage: ObjectStorage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  eligible<T extends ObjectLiteral>(query: SelectQueryBuilder<T>): void {
    query.innerJoin(
      ListingMedia,
      'primaryMedia',
      "primaryMedia.listingId = listing.id AND primaryMedia.isPrimary = true AND primaryMedia.status = 'READY'",
    );
    for (const kind of ['thumbnail', 'medium', 'large'] as const)
      query.innerJoin(
        MediaVariant,
        `${kind}Variant`,
        `${kind}Variant.mediaId = primaryMedia.id AND ${kind}Variant.kind = :${kind}Kind`,
        { [`${kind}Kind`]: kind },
      );
  }
  attach<T extends ObjectLiteral>(query: SelectQueryBuilder<T>): void {
    this.eligible(query);
    query
      .addSelect('thumbnailVariant.storageKey', 'thumbnailKey')
      .addSelect('thumbnailVariant.width', 'thumbnailWidth')
      .addSelect('thumbnailVariant.height', 'thumbnailHeight');
  }
  async thumbnail(
    key: string,
    width: number,
    height: number,
  ): Promise<SearchImage> {
    return {
      url: await this.storage.readUrl(key, this.config.media.readTtl),
      width,
      height,
    };
  }
}
