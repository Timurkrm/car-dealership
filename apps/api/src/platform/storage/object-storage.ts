import {
  HeadBucketCommand,
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config';
import type { AppConfig } from '../../config/config';

@Injectable()
export class ObjectStorage implements OnApplicationShutdown {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.bucket = config.storage.bucket;
    this.client = new S3Client({
      endpoint: config.storage.endpoint,
      region: config.storage.region,
      forcePathStyle: config.storage.forcePathStyle,
      credentials: {
        accessKeyId: config.storage.accessKey,
        secretAccessKey: config.storage.secretKey,
      },
      maxAttempts: 2,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      requestHandler: { connectionTimeout: 3000, requestTimeout: 3000 },
    });
  }
  async checkBucket(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
  async uploadUrl(
    key: string,
    contentType: string,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn, signableHeaders: new Set(['content-type']) },
    );
  }
  async readUrl(key: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: 'image/webp',
        ResponseContentDisposition: 'inline',
        ResponseCacheControl: 'private, max-age=60',
      }),
      { expiresIn },
    );
  }
  async head(key: string): Promise<{ size: number; etag: string } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      if (!result.ETag || result.ContentLength === undefined)
        throw new Error('Invalid object metadata');
      return { size: result.ContentLength, etag: result.ETag };
    } catch (error) {
      if (storageStatus(error) === 404) return null;
      throw new StorageFailure();
    }
  }
  async readBounded(key: string, max: number, etag: string): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, IfMatch: etag }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
      if (!(result.Body instanceof Readable)) throw new StorageFailure();
      if (!result.ContentLength || result.ContentLength > max) {
        result.Body.destroy();
        throw new ObjectChanged();
      }
      let size = 0;
      const chunks: Uint8Array[] = [];
      for await (const chunk of result.Body) {
        if (!(chunk instanceof Uint8Array)) throw new StorageFailure();
        size += chunk.length;
        if (size > max) {
          result.Body.destroy();
          throw new ObjectChanged();
        }
        chunks.push(chunk);
      }
      if (size !== result.ContentLength) throw new StorageFailure();
      return Buffer.concat(chunks, size);
    } catch (error) {
      if (
        error instanceof ObjectChanged ||
        storageStatus(error) === 412 ||
        storageStatus(error) === 404
      )
        throw new ObjectChanged();
      throw new StorageFailure();
    }
  }
  async putVariant(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'image/webp',
          ContentDisposition: 'inline',
          CacheControl: 'private, max-age=60',
        }),
        { abortSignal: AbortSignal.timeout(15000) },
      );
    } catch {
      throw new StorageFailure();
    }
  }
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    } catch {
      throw new StorageFailure();
    }
  }
  async keys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      for (const object of result.Contents ?? [])
        if (object.Key?.startsWith(prefix)) keys.push(object.Key);
      if (!result.IsTruncated) return keys;
      token = result.NextContinuationToken;
    }
    throw new StorageFailure();
  }
  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
function storageStatus(error: unknown): unknown {
  if (!error || typeof error !== 'object' || !('$metadata' in error))
    return undefined;
  const meta = error.$metadata;
  return meta && typeof meta === 'object' && 'httpStatusCode' in meta
    ? meta.httpStatusCode
    : undefined;
}
export class StorageFailure extends Error {
  constructor() {
    super('Object storage unavailable');
  }
}
export class ObjectChanged extends Error {
  constructor() {
    super('Source object changed or missing');
  }
}
