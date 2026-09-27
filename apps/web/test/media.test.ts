import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  validateFiles,
  moved,
  processing,
  failureMessage,
} from '../src/features/media/media-model';
import {
  MediaClient,
  parseMediaList,
  parsePhoto,
  uploadDirect,
} from '../src/features/media/media-client';
import { AuthClient } from '../src/features/auth/auth-client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaGallery } from '../src/features/media/media-gallery';
const id = '60000000-0000-4000-8000-000000000001';
const photo = (status = 'READY') => ({
  id,
  status,
  sortOrder: 0,
  isPrimary: status === 'READY',
  failureCode: null,
  width: 60,
  height: 40,
  variants:
    status === 'READY'
      ? Object.fromEntries(
          ['thumbnail', 'medium', 'large'].map((kind) => [
            kind,
            {
              url: `https://storage.example.test/${kind}.webp`,
              width: 60,
              height: 40,
            },
          ]),
        )
      : null,
  storageKey: 'private-source',
  exif: 'GPS',
});
const limits = {
  maxImages: 3,
  maxFileSize: 1048576,
  supportedTypes: ['image/jpeg', 'image/png', 'image/webp'],
};
test('file selection respects server-provided count, bytes and types, including multiple selections', () => {
  assert.equal(
    validateFiles([{ type: 'image/png', size: 100 }], 2, limits),
    null,
  );
  assert.match(
    validateFiles(
      [
        { type: 'image/png', size: 100 },
        { type: 'image/png', size: 100 },
      ],
      2,
      limits,
    )!,
    /не более 3/,
  );
  assert.match(
    validateFiles([{ type: 'image/svg+xml', size: 100 }], 0, limits)!,
    /JPEG/,
  );
  assert.match(
    validateFiles([{ type: 'image/png', size: 1048577 }], 0, limits)!,
    /1 МБ/,
  );
});
test('reload/polling restores pending/processing/failed state from the API and strips private data', () => {
  const result = parseMediaList({
    items: [
      photo('PENDING'),
      photo('PROCESSING'),
      { ...photo('FAILED'), failureCode: 'INVALID_IMAGE' },
    ],
    limits,
  });
  assert.equal(processing(result.items), true);
  assert.equal(processing([parsePhoto(photo())]), false);
  assert.ok(!JSON.stringify(result).includes('private-source'));
  assert.ok(!JSON.stringify(result).includes('GPS'));
  assert.match(failureMessage(result.items[2]!.failureCode), /допустимым/);
  assert.match(failureMessage('IMAGE_TOO_LARGE'), /большое/);
  assert.throws(() => parsePhoto({ ...photo(), status: 'DELETED' }));
});
test('accessible reorder moves one step and safely handles boundaries', () => {
  assert.deepEqual(moved(['a', 'b'], 'b', -1), ['b', 'a']);
  assert.deepEqual(moved(['a', 'b'], 'a', 1), ['b', 'a']);
  assert.deepEqual(moved(['a', 'b'], 'a', -1), ['a', 'b']);
  assert.deepEqual(moved(['a', 'b'], 'missing', 1), ['a', 'b']);
});
test('gallery renders only processed READY photos, primary label and responsive dimensions', () => {
  const html = renderToStaticMarkup(
    createElement(MediaGallery, {
      photos: [
        parsePhoto(photo()),
        parsePhoto(photo('PROCESSING')),
        parsePhoto(photo('FAILED')),
      ],
    }),
  );
  assert.ok(html.includes('главное фото'));
  assert.ok(html.includes('medium.webp'));
  assert.ok(html.includes('large.webp'));
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.ok(!html.includes('private-source'));
  assert.ok(!html.includes('GPS'));
});
test('cancelled delete confirmation sends no request and confirmed deletion uses the protected API', async () => {
  let calls = 0;
  const client = new AuthClient(async (input) => {
    if (String(input).endsWith('/auth/refresh'))
      return new Response(
        JSON.stringify({ accessToken: 'memory-token', expiresIn: 600 }),
        { status: 200 },
      );
    calls++;
    return new Response(JSON.stringify({ items: [], limits }), { status: 200 });
  });
  const api = new MediaClient(client);
  assert.equal(await api.deleteConfirmed(id, id, () => false), null);
  assert.equal(calls, 0);
  const deleted = await api.deleteConfirmed(id, id, () => true);
  assert.deepEqual(deleted?.items, []);
  assert.equal(calls, 1);
});
test('media API sends primary/order/delete/complete through existing auth client without embedding storage keys', async () => {
  const calls: { path: string; method?: string; body?: BodyInit | null }[] = [];
  const client = new AuthClient(async (input, init) => {
    const path = String(input);
    calls.push({ path, method: init?.method, body: init?.body });
    if (path.endsWith('/auth/refresh'))
      return new Response(
        JSON.stringify({ accessToken: 'memory-token', expiresIn: 600 }),
        { status: 200 },
      );
    return new Response(JSON.stringify({ items: [photo()], limits }), {
      status: 200,
    });
  });
  const api = new MediaClient(client);
  await api.mutate(id, 'primary', id);
  await api.mutate(id, 'order', undefined, [id]);
  await api.mutate(id, 'delete', id);
  await api.mutate(id, 'complete', id);
  assert.ok(
    calls.some(
      (call) => call.method === 'DELETE' && call.path.endsWith(`/media/${id}`),
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.method === 'PUT' &&
        call.body === JSON.stringify({ mediaIds: [id] }),
    ),
  );
  assert.ok(
    calls.some(
      (call) => call.method === 'POST' && call.path.endsWith('/complete'),
    ),
  );
});
test('direct storage transport reports progress, sends no cookies/Bearer and supports cancellation', async () => {
  const original = globalThis.XMLHttpRequest;
  const sent: {
    headers: Record<string, string>;
    credentials?: boolean;
    method?: string;
    url?: string;
    timeout?: number;
  } = { headers: {} };
  class FakeXhr {
    status = 200;
    timeout = 0;
    withCredentials = true;
    upload: {
      onprogress?: (event: {
        lengthComputable: boolean;
        loaded: number;
        total: number;
      }) => void;
    } = {};
    onload?: () => void;
    onerror?: () => void;
    ontimeout?: () => void;
    onabort?: () => void;
    open(method: string, url: string) {
      sent.method = method;
      sent.url = url;
    }
    setRequestHeader(key: string, value: string) {
      sent.headers[key] = value;
    }
    send() {
      sent.credentials = this.withCredentials;
      sent.timeout = this.timeout;
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      });
      queueMicrotask(() => this.onload?.());
    }
    abort() {
      this.onabort?.();
    }
  }
  // Localized test double for the browser-only transport.
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  try {
    const progress: number[] = [];
    await uploadDirect(
      'https://storage.example.test/signed',
      'image/png',
      new Blob(['test']),
      (value) => progress.push(value),
      new AbortController().signal,
    );
    assert.deepEqual(progress, [50]);
    assert.equal(sent.credentials, false);
    assert.deepEqual(sent.headers, { 'Content-Type': 'image/png' });
    assert.equal(sent.method, 'PUT');
    assert.equal(sent.timeout, 120000);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      () =>
        uploadDirect(
          'https://storage.example.test/signed',
          'image/png',
          new Blob(),
          () => {},
          abort.signal,
        ),
      { name: 'AbortError' },
    );
  } finally {
    globalThis.XMLHttpRequest = original;
  }
});
