import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { APP_CONFIG } from '../../../../config/config';
import type { AppConfig } from '../../../../config/config';
import { InvalidImage, VARIANT_KINDS } from '../../domain/media-policy';
@Injectable()
export class ImageProcessor {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    sharp.concurrency(1);
    sharp.cache({ memory: 32, files: 0, items: 32 });
  }
  async process(bytes: Buffer) {
    const config = this.config.media;
    if (bytes.length > config.maxFileSize)
      throw new InvalidImage('IMAGE_TOO_LARGE');
    const options = {
      limitInputPixels: config.maxPixels,
      failOn: 'warning' as const,
      animated: false,
    };
    try {
      const metadata = await sharp(bytes, options).metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw new InvalidImage('UNSUPPORTED_IMAGE');
      if (!metadata.width || !metadata.height)
        throw new InvalidImage('INVALID_IMAGE');
      if (
        metadata.width > config.maxWidth ||
        metadata.height > config.maxHeight ||
        metadata.width * metadata.height > config.maxPixels
      )
        throw new InvalidImage('IMAGE_TOO_LARGE');
      const variants = [];
      for (const kind of VARIANT_KINDS) {
        const width =
          kind === 'thumbnail'
            ? config.thumbnailWidth
            : kind === 'medium'
              ? config.mediumWidth
              : config.largeWidth;
        // Sharp strips metadata by default. No keepMetadata/withMetadata call is permitted here.
        const output = await sharp(bytes, options)
          .autoOrient()
          .resize({
            width,
            height: width,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: config.quality })
          .timeout({ seconds: 20 })
          .toBuffer({ resolveWithObject: true });
        variants.push({
          kind,
          bytes: output.data,
          width: output.info.width,
          height: output.info.height,
          size: output.data.length,
        });
      }
      return {
        format: metadata.format!,
        width: metadata.autoOrient?.width ?? metadata.width,
        height: metadata.autoOrient?.height ?? metadata.height,
        variants,
      };
    } catch (error) {
      if (error instanceof InvalidImage) throw error;
      // Decoder messages remain private; pixel-limit failures use a stable machine code.
      if (error instanceof Error && /pixel limit/i.test(error.message))
        throw new InvalidImage('IMAGE_TOO_LARGE');
      throw new InvalidImage('INVALID_IMAGE');
    }
  }
}
