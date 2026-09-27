import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import sharp from 'sharp';
import { parseMediaConfig } from '../../src/config/media-config';
import { loadConfig } from '../../src/config/config';
import {
  editableMedia,
  sourceKey,
  variantKey,
  validateUpload,
  InvalidImage,
} from '../../src/modules/media/domain/media-policy';
import { ImageProcessor } from '../../src/modules/media/infrastructure/image/image-processor';
test('media limits are centralized and bounded; only editable listings and raster declarations are accepted', () => {
  const issues: string[] = [],
    config = parseMediaConfig({}, issues);
  assert.deepEqual(issues, []);
  for (const status of ['DRAFT', 'REJECTED']) editableMedia(status);
  for (const status of ['PENDING_MODERATION', 'PUBLISHED', 'SOLD', 'ARCHIVED'])
    assert.throws(() => editableMedia(status));
  for (const type of ['image/jpeg', 'image/png', 'image/webp'])
    validateUpload(config.maxFileSize, type, config);
  for (const type of ['image/svg+xml', 'text/html', 'image/gif'])
    assert.throws(() => validateUpload(100, type, config));
  for (const size of [0, -1, config.maxFileSize + 1, 1.5])
    assert.throws(() => validateUpload(size, 'image/jpeg', config));
  parseMediaConfig(
    { MEDIA_MAX_PIXELS: 'Infinity', MEDIA_WORKER_CONCURRENCY: '100' },
    issues,
  );
  assert.equal(issues.length, 2);
});
test('generated keys cannot traverse or use raw filenames; processing attempts have distinct immutable prefixes', () => {
  const id = randomUUID(),
    token = randomUUID();
  const a = sourceKey(id),
    b = sourceKey(id);
  assert.notEqual(a, b);
  assert.ok(a.startsWith(`media/${id}/source/`));
  assert.equal(
    variantKey(id, token, 'large'),
    `media/${id}/variants/${token}/large.webp`,
  );
  assert.notEqual(
    variantKey(id, token, 'large'),
    variantKey(id, randomUUID(), 'large'),
  );
  for (const invalid of ['../private', 'https://evil.test', '/key']) {
    assert.throws(() => sourceKey(invalid));
    assert.throws(() => variantKey(id, invalid, 'medium'));
  }
});
test('real raster decoder rejects spoofed/truncated/unsupported content and dimension/pixel limits', async () => {
  const base = loadConfig('test');
  const image = new ImageProcessor({
    ...base,
    media: { ...base.media, maxWidth: 80, maxHeight: 80, maxPixels: 4096 },
  });
  for (const bytes of [
    Buffer.from('<script>evil</script>'),
    Buffer.from([0xff, 0xd8, 0xff]),
  ])
    await assert.rejects(() => image.process(bytes), InvalidImage);
  const oversized = await sharp({
    create: { width: 70, height: 70, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    () => image.process(oversized),
    (error: unknown) =>
      error instanceof InvalidImage && error.code === 'IMAGE_TOO_LARGE',
  );
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" /></svg>',
  );
  await assert.rejects(() => image.process(svg), InvalidImage);
});
test('variants apply orientation, strip all EXIF and preserve ratio without upscaling', async () => {
  const image = new ImageProcessor(loadConfig('test'));
  const source = await sharp({
    create: { width: 60, height: 40, channels: 3, background: 'red' },
  })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'Private camera' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '52/1 22/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '4/1 54/1 0/1',
      },
    })
    .jpeg()
    .toBuffer();
  const metadata = await sharp(source).metadata();
  assert.ok(metadata.exif);
  assert.equal(metadata.orientation, 6);
  assert.ok(metadata.exif.includes(Buffer.from('Private camera')));
  const result = await image.process(source);
  assert.equal(result.variants.length, 3);
  for (const variant of result.variants) {
    const meta = await sharp(variant.bytes).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 40);
    assert.equal(meta.height, 60);
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
    assert.equal(meta.xmp, undefined);
  }
});
