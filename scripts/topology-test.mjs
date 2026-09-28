import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { clearTimeout } from 'node:timers';
import { io } from 'socket.io-client';
import pg from 'pg';

if (existsSync('.env.production.local')) loadEnvFile('.env.production.local');
const { fetch, AbortSignal } = globalThis;
const apiA = process.env.REFERENCE_API_A_URL ?? 'http://127.0.0.1:64001';
const apiB = process.env.REFERENCE_API_B_URL ?? 'http://127.0.0.1:64002';
const proxy = process.env.REFERENCE_PROXY_URL ?? 'https://localhost:8443';
// Caddy's internal CA is intentionally local-only. External targets always retain
// normal certificate verification.
if (
  new URL(proxy).protocol === 'https:' &&
  new URL(proxy).hostname === 'localhost'
)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const origin = 'https://localhost:8443';
const password =
  process.env.TOPOLOGY_TEST_PASSWORD ?? 'Marketplace-e2e-password-2026!';
const conversationId = '70000000-0000-4000-8000-000000000001';

await waitFor(`${apiA}/api/v1/health/ready`);
await waitFor(`${apiB}/api/v1/health/ready`);
const metrics = await fetch(`${apiA}/api/internal/metrics`, {
  signal: AbortSignal.timeout(5000),
});
const metricsBody = await metrics.text();
if (
  !metrics.ok ||
  !metricsBody.includes('marketplace_db_pool_connections') ||
  !metricsBody.includes('marketplace_outbox_items')
)
  throw new Error('Internal metrics contract unavailable');
const publicMetrics = await fetch(`${proxy}/api/internal/metrics`, {
  signal: AbortSignal.timeout(5000),
});
await publicMetrics.body?.cancel();
if (publicMetrics.status !== 404)
  throw new Error('Metrics endpoint is exposed through public ingress');
process.stdout.write(
  'PASS internal metrics available and public ingress denied\n',
);
const seller = await login(apiA, 'seller@example.test');
const buyer = await login(apiB, 'buyer@example.test');

const crossInstanceSession = await request(
  `${apiB}/api/v1/auth/me`,
  { headers: { authorization: `Bearer ${seller}` } },
  200,
);
if (crossInstanceSession.email !== 'seller@example.test')
  throw new Error('Session was not accepted by the second API instance');
process.stdout.write('PASS shared session across API A/B\n');

const socket = io(`${apiB}/realtime`, {
  transports: ['websocket'],
  auth: { accessToken: buyer },
  extraHeaders: { origin },
  reconnection: false,
});
await socketEvent(socket, 'connect', 8000);
const messageId = randomUUID();
const received = socketEvent(socket, 'message:created', 8000);
await request(
  `${apiA}/api/v1/me/conversations/${conversationId}/messages`,
  {
    method: 'POST',
    headers: {
      authorization: `Bearer ${seller}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      clientMessageId: messageId,
      body: 'Cross-instance topology smoke',
    }),
  },
  200,
);
await received;
socket.close();
process.stdout.write('PASS Redis cross-instance realtime delivery\n');

let throttled = false;
for (let index = 0; index < 24; index++) {
  const target = index % 2 === 0 ? apiA : apiB;
  const response = await fetch(
    `${target}/api/v1/search/listings/facets?type=VEHICLE`,
    { signal: AbortSignal.timeout(5000) },
  );
  await response.body?.cancel();
  if (response.status === 429) {
    throttled = true;
    break;
  }
  if (!response.ok)
    throw new Error(`Rate-limit probe failed (${response.status})`);
}
if (!throttled) throw new Error('Shared Redis rate limit was not observed');
process.stdout.write('PASS shared rate limiter across API A/B\n');

let trafficRunning = true;
let successful = 0;
let failed = 0;
const traffic = (async () => {
  while (trafficRunning) {
    try {
      const response = await fetch(`${proxy}/api/v1/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) successful += 1;
      else failed += 1;
      await response.body?.cancel();
    } catch {
      failed += 1;
    }
    await delay(100);
  }
})();
for (const service of ['api-a', 'api-b']) {
  await compose('restart', service);
  await waitFor(
    `${service === 'api-a' ? apiA : apiB}/api/v1/health/ready`,
    30_000,
  );
  // Allow the proxy's active health cycle to re-admit the returned instance
  // before the other member is drained.
  await delay(6000);
}
trafficRunning = false;
await traffic;
if (successful < 10 || failed > 1)
  throw new Error(
    `Rolling traffic failed: successful=${successful} failed=${failed}`,
  );
process.stdout.write(
  `PASS rolling restart traffic successful=${successful} failed=${failed}\n`,
);

const database = new pg.Client({
  host: '127.0.0.1',
  port: Number(process.env.REFERENCE_DATABASE_PORT ?? 65432),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
});
await database.connect();
try {
  const result = await database.query(
    'SELECT count(*)::integer AS count FROM messages WHERE client_message_id=$1',
    [messageId],
  );
  if (result.rows[0]?.count !== 1)
    throw new Error('Cross-instance message was not exactly-once durable');
} finally {
  await database.end();
}
process.stdout.write('PASS no duplicate authoritative message write\n');

async function login(base, email) {
  const body = await request(
    `${base}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    200,
  );
  if (typeof body.accessToken !== 'string')
    throw new Error('Login token missing');
  return body.accessToken;
}

async function request(url, options, expected) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  if (response.status !== expected)
    throw new Error(
      `Expected ${expected} from ${url}; received ${response.status}`,
    );
  return text ? JSON.parse(text) : {};
}

async function waitFor(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // Instance is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function socketEvent(client, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMs,
    );
    client.once(event, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    client.once('connect_error', () => {
      clearTimeout(timer);
      reject(new Error(`Socket failed before ${event}`));
    });
  });
}

async function compose(...args) {
  const child = spawn(
    'docker',
    [
      'compose',
      '-f',
      'compose.production.example.yml',
      '--env-file',
      '.env.production.local',
      ...args,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        DEPLOY_ENV_FILE: '.env.production.local',
        REFERENCE_NODE_ENV: 'test',
      },
    },
  );
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (status !== 0) throw new Error(`docker compose failed (${status})`);
}
