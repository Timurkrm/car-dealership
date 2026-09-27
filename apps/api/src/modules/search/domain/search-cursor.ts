import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { searchError, searchFingerprint } from './search-query';
import type { SearchQuery } from './search-query';

export interface SearchPosition {
  id: string;
  publishedAt: string;
  value: string;
}
function validSortValue(query: SearchQuery, position: SearchPosition): boolean {
  if (query.sort === 'newest') return position.value === position.publishedAt;
  if (query.sort.startsWith('price_'))
    return (
      /^(0|[1-9]\d{0,18})$/.test(position.value) &&
      BigInt(position.value) <= 9223372036854775807n
    );
  if (query.sort === 'mileage_asc')
    return (
      /^(0|[1-9]\d{0,9})$/.test(position.value) &&
      Number(position.value) <= 2147483647
    );
  if (query.sort === 'year_desc')
    return (
      /^\d{4}$/.test(position.value) &&
      Number(position.value) >= 1886 &&
      Number(position.value) <= 2100
    );
  const distance = Number(position.value);
  return (
    /^(0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/.test(position.value) &&
    Number.isFinite(distance) &&
    distance >= 0 &&
    distance <= 21000000
  );
}
@Injectable()
export class SearchCursor {
  private readonly key: Buffer;
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(config.auth.accessSecret, 'hex'),
        'marketplace-search',
        'cursor-v1',
        32,
      ),
    );
  }
  encode(query: SearchQuery, position: SearchPosition): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('search-cursor:1'));
    const data = Buffer.from(
      JSON.stringify({
        version: 1,
        fingerprint: searchFingerprint(query),
        expires: Date.now() + 86400000,
        ...position,
      }),
    );
    return `1.${Buffer.concat([iv, cipher.update(data), cipher.final(), cipher.getAuthTag()]).toString('base64url')}`;
  }
  decode(query: SearchQuery): SearchPosition | null {
    if (query.cursor === undefined) return null;
    let value: unknown;
    try {
      if (!/^1\.[A-Za-z0-9_-]{64,2046}$/.test(query.cursor)) throw new Error();
      const body = Buffer.from(query.cursor.slice(2), 'base64url');
      if (body.toString('base64url') !== query.cursor.slice(2))
        throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        body.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from('search-cursor:1'));
      decipher.setAuthTag(body.subarray(-16));
      value = JSON.parse(
        Buffer.concat([
          decipher.update(body.subarray(12, -16)),
          decipher.final(),
        ]).toString('utf8'),
      );
    } catch {
      return searchError('SEARCH_INVALID_CURSOR', 'cursor');
    }
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== 1 ||
      !('fingerprint' in value) ||
      typeof value.fingerprint !== 'string' ||
      !('expires' in value) ||
      typeof value.expires !== 'number' ||
      !Number.isSafeInteger(value.expires) ||
      value.expires < Date.now() ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        value.id,
      ) ||
      !('publishedAt' in value) ||
      typeof value.publishedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(
        value.publishedAt,
      ) ||
      !Number.isFinite(Date.parse(value.publishedAt)) ||
      !('value' in value) ||
      typeof value.value !== 'string' ||
      value.value.length > 40
    )
      return searchError('SEARCH_INVALID_CURSOR', 'cursor');
    if (value.fingerprint !== searchFingerprint(query))
      return searchError('SEARCH_CURSOR_QUERY_MISMATCH', 'cursor');
    if (
      !validSortValue(query, {
        id: value.id,
        publishedAt: value.publishedAt,
        value: value.value,
      })
    )
      return searchError('SEARCH_INVALID_CURSOR', 'cursor');
    return { id: value.id, publishedAt: value.publishedAt, value: value.value };
  }
}
