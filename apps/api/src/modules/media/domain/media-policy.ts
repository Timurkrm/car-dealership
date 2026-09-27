import { randomUUID } from 'node:crypto';
import { ApiException } from '../../../platform/http/api-error';
import type { MediaConfig } from '../../../config/media-config';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VARIANT_KINDS = ['thumbnail', 'medium', 'large'] as const;
export const PROCESSING_ATTEMPTS = 4;
export const LEASE_MS = 180000;
export function editableMedia(status: string): void {
  if (status !== 'DRAFT' && status !== 'REJECTED')
    throw new ApiException(
      409,
      'LISTING_MEDIA_LOCKED',
      'Photos can only be changed in a draft or rejected listing',
    );
}
export function validateUpload(
  size: number,
  type: string,
  config: MediaConfig,
): void {
  if (!IMAGE_TYPES.some((t) => t === type))
    throw new ApiException(
      400,
      'MEDIA_UNSUPPORTED_TYPE',
      'Only JPEG, PNG and WebP photos are supported',
    );
  if (!Number.isInteger(size) || size < 1 || size > config.maxFileSize)
    throw new ApiException(
      400,
      'MEDIA_FILE_TOO_LARGE',
      'Photo exceeds the upload size limit',
    );
}
function uuid(value: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new RangeError('Invalid media identifier');
  return value;
}
export function mediaPrefix(id: string): string {
  return `media/${uuid(id)}/`;
}
export function sourceKey(id: string): string {
  return `${mediaPrefix(id)}source/${randomUUID()}`;
}
export function variantKey(
  id: string,
  token: string,
  kind: (typeof VARIANT_KINDS)[number],
): string {
  if (!VARIANT_KINDS.includes(kind)) throw new RangeError('Invalid variant');
  return `${mediaPrefix(id)}variants/${uuid(token)}/${kind}.webp`;
}
export class InvalidImage extends Error {
  constructor(
    readonly code:
      | 'INVALID_IMAGE'
      | 'IMAGE_TOO_LARGE'
      | 'UNSUPPORTED_IMAGE'
      | 'SOURCE_CHANGED',
  ) {
    super(code);
  }
}
