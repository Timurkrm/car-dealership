import { execFile } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { promisify } from 'node:util';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import pg from 'pg';
import sharp from 'sharp';

if (existsSync('.env.production.local')) loadEnvFile('.env.production.local');

const execute = promisify(execFile);
const api = process.env.MEDIA_BENCHMARK_API_URL ?? 'http://127.0.0.1:64001';
const webOrigin =
  process.env.MEDIA_BENCHMARK_WEB_ORIGIN ?? 'https://localhost:8443';
const password =
  process.env.MEDIA_BENCHMARK_PASSWORD ?? 'Marketplace-e2e-password-2026!';
const repetitions = boundedInteger(
  process.env.MEDIA_BENCHMARK_REPETITIONS,
  2,
  1,
  5,
);
const workerContainer =
  process.env.MEDIA_WORKER_CONTAINER ?? 'marketplace-reference-media-worker-1';
const database = new pg.Client({
  host: process.env.REFERENCE_DATABASE_HOST ?? '127.0.0.1',
  port: Number(process.env.REFERENCE_DATABASE_PORT ?? 65432),
  database: required('DATABASE_NAME'),
  user: required('DATABASE_USER'),
  password: required('DATABASE_PASSWORD'),
});
const storage = new S3Client({
  endpoint: process.env.MEDIA_BENCHMARK_S3_ENDPOINT ?? 'http://127.0.0.1:59002',
  region: required('S3_REGION'),
  forcePathStyle: true,
  credentials: {
    accessKeyId: required('S3_ACCESS_KEY'),
    secretAccessKey: required('S3_SECRET_KEY'),
  },
});
const profiles = [
  { name: 'card', width: 1280, height: 960 },
  { name: 'large', width: 3000, height: 2000 },
  { name: 'near-pixel-limit', width: 6200, height: 6200 },
];

await database.connect();
const listingId = randomUUID();
const vehicleId = randomUUID();
let sampling = true;
let peakRssMiB = 0;
const samples = [];
try {
  await createDraftListing();
  const token = await login();
  const uploads = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const profile of profiles) {
      const buffer = await imageFixture(profile, repetition);
      const intent = await request(
        `/api/v1/me/listings/${listingId}/media/uploads`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            filename: `${profile.name}-${repetition}.jpg`,
            contentType: 'image/jpeg',
            sizeBytes: buffer.length,
          }),
        },
        201,
      );
      const location = new URL(intent.upload.url);
      const [, bucket, ...keyParts] = location.pathname.split('/');
      const key = keyParts.map(decodeURIComponent).join('/');
      if (!bucket || !key) throw new Error('Unexpected upload URL shape');
      await storage.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'image/jpeg',
        }),
      );
      uploads.push({
        mediaId: intent.mediaId,
        profile: profile.name,
        width: profile.width,
        height: profile.height,
        sourceBytes: buffer.length,
      });
    }
  }

  const rssSampling = sampleRss();
  const startedAt = Date.now();
  const submittedAt = new Map();
  const dispatchOrder = [...uploads].sort(
    (left, right) => right.width * right.height - left.width * left.height,
  );
  await Promise.all(
    dispatchOrder.map(async (upload) => {
      submittedAt.set(upload.mediaId, Date.now());
      await request(
        `/api/v1/me/listings/${listingId}/media/${upload.mediaId}/complete`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: '{}',
        },
        200,
      );
    }),
  );
  const completed = await waitForMedia(uploads.map((item) => item.mediaId));
  sampling = false;
  await rssSampling;
  const finishedAt = Math.max(
    ...completed.map((item) => new Date(item.processed_at).getTime()),
  );
  const durations = completed
    .map(
      (item) =>
        new Date(item.processed_at).getTime() -
        (submittedAt.get(item.id) ?? startedAt),
    )
    .sort((left, right) => left - right);
  const elapsedSeconds = (finishedAt - startedAt) / 1000;
  const result = {
    generatedAt: new Date().toISOString(),
    environment: 'local production-like reference topology',
    workerConcurrency: Number(process.env.MEDIA_WORKER_CONCURRENCY ?? 2),
    sampleCount: uploads.length,
    profiles: uploads.map((upload) => ({
      profile: upload.profile,
      dimensions: `${upload.width}x${upload.height}`,
      sourceBytes: upload.sourceBytes,
    })),
    elapsedSeconds: round(elapsedSeconds),
    imagesPerMinute: round((uploads.length / elapsedSeconds) * 60),
    processingLatencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: Math.max(...durations),
    },
    peakWorkerRssMiB: round(peakRssMiB),
    rssSamples: samples.length,
  };
  await mkdir('qa-results', { recursive: true });
  await writeFile(
    'qa-results/media-benchmark.json',
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  sampling = false;
  await cleanup().catch(() => undefined);
  await database.end();
  storage.destroy();
}

async function createDraftListing() {
  await database.query('BEGIN');
  try {
    await database.query(
      `INSERT INTO vehicles(id,model_id,generation_id,year,mileage_km,body_type,fuel_type,transmission,drive_type,color,condition)
       VALUES ($1,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2024,1000,'SEDAN','PETROL','AUTOMATIC','RWD','BLUE','USED')`,
      [vehicleId],
    );
    await database.query(
      `INSERT INTO listings(id,seller_id,type,title,description,price_minor,currency,status)
       VALUES ($1,'40000000-0000-4000-8000-000000000001','VEHICLE','Media capacity fixture','Synthetic benchmark only',2500000,'EUR','DRAFT')`,
      [listingId],
    );
    await database.query(
      `INSERT INTO vehicle_listings(listing_id,type,vehicle_id) VALUES ($1,'VEHICLE',$2)`,
      [listingId, vehicleId],
    );
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

async function login() {
  const response = await request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { origin: webOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'seller@example.test', password }),
    },
    200,
  );
  if (typeof response.accessToken !== 'string')
    throw new Error('Media benchmark login token missing');
  return response.accessToken;
}

async function imageFixture(profile, repetition) {
  const tile = Buffer.from(
    `<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg"><rect width="192" height="192" fill="#315b73"/><path d="M0 ${20 + repetition * 7} L192 ${150 - repetition * 5}" stroke="#d2a63c" stroke-width="13"/><circle cx="96" cy="96" r="${28 + repetition * 3}" fill="#e9eef2"/></svg>`,
  );
  return sharp({
    create: {
      width: profile.width,
      height: profile.height,
      channels: 3,
      background: '#315b73',
    },
    limitInputPixels: 40_000_000,
  })
    .composite([{ input: tile, tile: true }])
    .jpeg({ quality: 88, chromaSubsampling: '4:2:0' })
    .toBuffer();
}

async function waitForMedia(ids) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const result = await database.query(
      `SELECT id,status,processed_at,failure_code FROM listing_media WHERE id=ANY($1::uuid[])`,
      [ids],
    );
    const failed = result.rows.find((row) => row.status === 'FAILED');
    if (failed)
      throw new Error(`Media worker failed with ${failed.failure_code}`);
    if (
      result.rows.length === ids.length &&
      result.rows.every((row) => row.status === 'READY' && row.processed_at)
    )
      return result.rows;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for media processing');
}

async function sampleRss() {
  while (sampling) {
    try {
      const { stdout } = await execute(
        'docker',
        ['stats', workerContainer, '--no-stream', '--format', '{{.MemUsage}}'],
        { timeout: 5000, windowsHide: true },
      );
      const value = parseMemory(stdout.split('/')[0]?.trim());
      if (Number.isFinite(value)) {
        peakRssMiB = Math.max(peakRssMiB, value);
        samples.push(value);
      }
    } catch {
      // RSS is optional telemetry; the processing result remains authoritative.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function cleanup() {
  await database.query('BEGIN');
  try {
    await database.query('DELETE FROM listing_media WHERE listing_id=$1', [
      listingId,
    ]);
    await database.query('DELETE FROM listings WHERE id=$1', [listingId]);
    await database.query('DELETE FROM vehicles WHERE id=$1', [vehicleId]);
    await database.query('COMMIT');
  } catch (error) {
    await database.query('ROLLBACK');
    throw error;
  }
}

async function request(path, options, expectedStatus) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (response.status !== expectedStatus)
    throw new Error(
      `Expected ${expectedStatus} from ${path}; received ${response.status}`,
    );
  return text ? JSON.parse(text) : {};
}

function parseMemory(value) {
  const match = /([0-9.]+)\s*(KiB|MiB|GiB)/i.exec(value);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  if (match[2].toLowerCase() === 'kib') return amount / 1024;
  if (match[2].toLowerCase() === 'gib') return amount * 1024;
  return amount;
}

function percentile(sorted, fraction) {
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(`Expected integer between ${minimum} and ${maximum}`);
  return parsed;
}
