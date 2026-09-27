import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';
import { ApiException } from './api-error';

interface CursorEnvelope {
  v: 1;
  scope: string;
  fingerprint: string;
  expiresAt: number;
  position: unknown;
}

@Injectable()
export class OpaqueCursor {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(config.auth.accessSecret, 'hex');
  }

  encode(scope: string, fingerprint: string, position: unknown): string {
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        scope,
        fingerprint,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        position,
      } satisfies CursorEnvelope),
    ).toString('base64url');
    const signature = this.sign(payload);
    return `1.${payload}.${signature}`;
  }

  decode(
    value: string | undefined,
    scope: string,
    fingerprint: string,
  ): unknown | null {
    if (value === undefined) return null;
    try {
      if (
        value.length > 2048 ||
        !/^1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)
      )
        throw new Error('shape');
      const [, payload, signature] = value.split('.');
      if (!payload || !signature) throw new Error('shape');
      const expected = Buffer.from(this.sign(payload));
      const received = Buffer.from(signature);
      if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received)
      )
        throw new Error('signature');
      const parsed: unknown = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      if (!parsed || typeof parsed !== 'object') throw new Error('payload');
      const envelope = parsed as Partial<CursorEnvelope>;
      if (
        envelope.v !== 1 ||
        envelope.scope !== scope ||
        typeof envelope.fingerprint !== 'string' ||
        typeof envelope.expiresAt !== 'number' ||
        envelope.expiresAt <= Date.now() ||
        !('position' in envelope)
      )
        throw new Error('payload');
      if (envelope.fingerprint !== fingerprint)
        throw new ApiException(
          400,
          'CURSOR_QUERY_MISMATCH',
          'Cursor belongs to another query',
        );
      return envelope.position;
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw new ApiException(
        400,
        'INVALID_CURSOR',
        'Invalid or expired cursor',
      );
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key)
      .update(`marketplace-cursor:${payload}`)
      .digest('base64url');
  }
}
