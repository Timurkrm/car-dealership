import { AuthApiError } from '../auth/auth-client';
import type { AuthClient } from '../auth/auth-client';
export const MEDIA_STATES = [
  'PENDING',
  'UPLOADED',
  'PROCESSING',
  'READY',
  'FAILED',
] as const;
export interface Variant {
  url: string;
  width: number;
  height: number;
}
export interface Photo {
  id: string;
  status: (typeof MEDIA_STATES)[number];
  sortOrder: number;
  isPrimary: boolean;
  failureCode: string | null;
  width: number | null;
  height: number | null;
  variants: { thumbnail: Variant; medium: Variant; large: Variant } | null;
}
export interface MediaList {
  items: Photo[];
  limits: { maxImages: number; maxFileSize: number; supportedTypes: string[] };
}
function invalid(): never {
  throw new AuthApiError(502, 'INVALID_API_RESPONSE');
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : invalid();
}
function number(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : invalid();
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}
export function mediaId(value: unknown): string {
  const id = string(value);
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    id,
  )
    ? id
    : invalid();
}
export function parseVariant(value: unknown): Variant {
  const row = object(value),
    url = string(row.url),
    parsed = new URL(url);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    return invalid();
  const width = number(row.width),
    height = number(row.height);
  if (!width || !height) return invalid();
  return { url, width, height };
}
export function parsePhoto(value: unknown): Photo {
  const row = object(value),
    state = MEDIA_STATES.find((status) => status === row.status);
  if (!state || typeof row.isPrimary !== 'boolean') return invalid();
  const variants = row.variants === null ? null : object(row.variants);
  return {
    id: mediaId(row.id),
    status: state,
    sortOrder: number(row.sortOrder),
    isPrimary: row.isPrimary,
    failureCode: row.failureCode === null ? null : string(row.failureCode),
    width: row.width === null ? null : number(row.width),
    height: row.height === null ? null : number(row.height),
    variants: variants
      ? {
          thumbnail: parseVariant(variants.thumbnail),
          medium: parseVariant(variants.medium),
          large: parseVariant(variants.large),
        }
      : null,
  };
}
export function parseMediaList(value: unknown): MediaList {
  const row = object(value),
    limits = object(row.limits);
  if (
    !Array.isArray(row.items) ||
    row.items.length > 30 ||
    !Array.isArray(limits.supportedTypes) ||
    limits.supportedTypes.some((type) => typeof type !== 'string')
  )
    return invalid();
  return {
    items: row.items.map(parsePhoto),
    limits: {
      maxImages: number(limits.maxImages),
      maxFileSize: number(limits.maxFileSize),
      supportedTypes: limits.supportedTypes.map(string),
    },
  };
}
export function parsePhotos(value: unknown): Photo[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) return invalid();
  return value.map(parsePhoto);
}
export class MediaClient {
  constructor(private readonly client: AuthClient) {}
  async deleteConfirmed(
    listing: string,
    media: string,
    confirm: () => boolean,
  ): Promise<MediaList | null> {
    return confirm() ? this.mutate(listing, 'delete', media) : null;
  }
  async list(listing: string, signal?: AbortSignal) {
    return parseMediaList(
      await (
        await this.client.apiAuthenticated(
          `me/listings/${mediaId(listing)}/media`,
          { signal },
        )
      ).json(),
    );
  }
  async initialize(
    listing: string,
    file: Pick<File, 'name' | 'type' | 'size'>,
    signal?: AbortSignal,
  ) {
    const row = object(
      await (
        await this.client.apiAuthenticated(
          `me/listings/${mediaId(listing)}/media/uploads`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              filename: file.name.slice(0, 255),
              contentType: file.type,
              sizeBytes: file.size,
            }),
            signal,
          },
        )
      ).json(),
    );
    const upload = object(row.upload);
    if (upload.method !== 'PUT') return invalid();
    const url = string(upload.url),
      parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return invalid();
    return {
      mediaId: mediaId(row.mediaId),
      url,
      contentType: string(object(upload.headers)['Content-Type']),
    };
  }
  async mutate(
    listing: string,
    action: 'complete' | 'primary' | 'delete' | 'order',
    media?: string,
    ids?: string[],
    signal?: AbortSignal,
  ) {
    const base = `me/listings/${mediaId(listing)}/media`;
    const path =
      action === 'order'
        ? `${base}/order`
        : `${base}/${mediaId(media)}${action === 'delete' ? '' : `/${action}`}`;
    return parseMediaList(
      await (
        await this.client.apiAuthenticated(path, {
          method:
            action === 'complete'
              ? 'POST'
              : action === 'delete'
                ? 'DELETE'
                : 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(action === 'order' ? { mediaIds: ids } : {}),
          signal,
        })
      ).json(),
    );
  }
}
/** Direct storage transport: never attach API authorization or browser cookies. */
export function uploadDirect(
  url: string,
  type: string,
  file: Blob,
  progress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open('PUT', url);
    xhr.timeout = 120000;
    xhr.withCredentials = false;
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () =>
      finish(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error('Upload failed'),
      );
    xhr.onerror = () => finish(new Error('Upload failed'));
    xhr.ontimeout = () => finish(new Error('Upload timed out'));
    xhr.onabort = () =>
      finish(new DOMException('Upload cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      finish(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }
    xhr.send(file);
  });
}
