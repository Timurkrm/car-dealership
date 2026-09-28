import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { io } from 'socket.io-client';

const base = process.env.API_URL ?? 'http://127.0.0.1:4200';
const webOrigin = process.env.WEB_URL ?? 'http://127.0.0.1:3200';
const password = 'Marketplace-e2e-password-2026!';
const messages = Math.min(
  50,
  Math.max(1, Number(process.env.WORKER_TRAFFIC_MESSAGES ?? 40)),
);
const conversationId = '70000000-0000-4000-8000-000000000001';

const database = new pg.Client({
  host: process.env.DATABASE_HOST ?? '127.0.0.1',
  port: Number(process.env.DATABASE_PORT ?? 55433),
  database: process.env.DATABASE_NAME ?? 'marketplace_e2e_test',
  user: process.env.DATABASE_USER ?? 'marketplace_e2e',
  password: process.env.DATABASE_PASSWORD ?? 'e2e-only-postgres-password',
});
if (database.database !== 'marketplace_e2e_test')
  throw new Error('Worker traffic refuses to use a non-E2E database');

async function login(email) {
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: webOrigin },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok)
    throw new Error(`Login failed for ${email}: ${response.status}`);
  return (await response.json()).accessToken;
}

const [buyerToken, sellerToken] = await Promise.all([
  login('buyer@example.test'),
  login('seller@example.test'),
]);
await database.connect();
const before = await counts();
let realtimeMessages = 0;
const socket = io(`${base}/realtime`, {
  transports: ['websocket'],
  auth: { accessToken: sellerToken },
  extraHeaders: { origin: webOrigin },
  reconnection: true,
});
socket.on('message:created', () => {
  realtimeMessages += 1;
});
await new Promise((resolvePromise, reject) => {
  const timeout = setTimeout(
    () => reject(new Error('Realtime socket connection timed out')),
    5000,
  );
  socket.once('connect', () => {
    globalThis.clearTimeout(timeout);
    resolvePromise();
  });
  socket.once('connect_error', reject);
});

const durations = [];
const started = performance.now();
let accepted = 0;
let throttled = 0;
let unexpected = 0;
for (let index = 0; index < messages; index += 1) {
  const requestStarted = performance.now();
  const response = await fetch(
    `${base}/api/v1/me/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${buyerToken}`,
        'content-type': 'application/json',
        'x-forwarded-for': `10.250.1.${index + 1}`,
      },
      body: JSON.stringify({
        clientMessageId: randomUUID(),
        body: `Worker traffic ${index + 1}`,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  await response.arrayBuffer();
  durations.push(performance.now() - requestStarted);
  if (response.status >= 200 && response.status < 300) accepted += 1;
  else if (response.status === 429) throttled += 1;
  else unexpected += 1;
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
}

const drainStarted = performance.now();
let backlog;
do {
  backlog = await pending();
  if (backlog.outbox === 0 && backlog.deliveries === 0) break;
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
} while (performance.now() - drainStarted < 30_000);
await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
const after = await counts();
const report = {
  schemaVersion: 1,
  messagesRequested: messages,
  accepted,
  throttled,
  unexpected,
  durationSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
  throughputPerSecond: Number(
    (accepted / ((performance.now() - started) / 1000)).toFixed(2),
  ),
  latencyMs: {
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
  },
  realtimeMessages,
  created: {
    messages: after.messages - before.messages,
    outbox: after.outbox - before.outbox,
    notifications: after.notifications - before.notifications,
    deliveries: after.deliveries - before.deliveries,
  },
  backlogAfterDrain: backlog,
  drainSeconds: Number(((performance.now() - drainStarted) / 1000).toFixed(2)),
};
socket.close();
await database.end();
mkdirSync(resolve('qa-results'), { recursive: true });
writeFileSync(
  resolve('qa-results', 'worker-traffic.json'),
  JSON.stringify(report, null, 2),
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (unexpected > 0 || accepted !== messages) process.exitCode = 1;
if (backlog.outbox !== 0 || backlog.deliveries !== 0) process.exitCode = 1;

async function counts() {
  const result = await database.query(`SELECT
    (SELECT count(*)::integer FROM messages) AS messages,
    (SELECT count(*)::integer FROM outbox_events) AS outbox,
    (SELECT count(*)::integer FROM notifications) AS notifications,
    (SELECT count(*)::integer FROM notification_deliveries) AS deliveries`);
  return Object.fromEntries(
    Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)]),
  );
}

async function pending() {
  const result = await database.query(`SELECT
    (SELECT count(*)::integer FROM outbox_events WHERE status IN ('PENDING','RETRY','PROCESSING')) AS outbox,
    (SELECT count(*)::integer FROM notification_deliveries WHERE status IN ('PENDING','RETRY','PROCESSING')) AS deliveries`);
  return {
    outbox: Number(result.rows[0].outbox),
    deliveries: Number(result.rows[0].deliveries),
  };
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return Number(
    (
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ??
      0
    ).toFixed(2),
  );
}
