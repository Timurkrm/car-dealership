import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { createClient } from 'redis';
import { io } from 'socket.io-client';

const profileName = process.argv[2] ?? 'smoke';
const profiles = {
  smoke: { duration: 10, concurrency: 2 },
  baseline: { duration: 30, concurrency: 10 },
  stress: { duration: 45, concurrency: 30 },
  soak: { duration: 1800, concurrency: 10 },
};
const selected = profiles[profileName];
if (!selected) throw new Error(`Unknown load profile: ${profileName}`);
const duration = Number(process.env.LOAD_DURATION_SECONDS ?? selected.duration);
const concurrency = Number(
  process.env.LOAD_CONCURRENCY ?? selected.concurrency,
);
const base = process.env.API_URL ?? 'http://127.0.0.1:4200';
const password = 'Marketplace-e2e-password-2026!';
const samples = [];
let sequence = 0;
const profileUser = {
  smoke: 'buyer@example.test',
  baseline: 'buyer@example.test',
  stress: 'seller@example.test',
  soak: 'buyer@example.test',
}[profileName];

const login = async () => {
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: process.env.WEB_URL ?? 'http://127.0.0.1:3200',
    },
    body: JSON.stringify({ email: profileUser, password }),
  });
  if (!response.ok) throw new Error(`Load login failed: ${response.status}`);
  return (await response.json()).accessToken;
};
let token = await login();
const runtime = await startRuntimeObservation(token, async () => {
  token = await login();
  return token;
});
const scenarios = [
  [
    'search',
    '/api/v1/listings?type=VEHICLE&currency=EUR&priceFromMinor=100000&yearFrom=2015&limit=20',
    24,
  ],
  [
    'map',
    '/api/v1/search/listings/map?type=VEHICLE&viewport=3,50,8,54&zoom=7&limit=500',
    12,
  ],
  ['facets', '/api/v1/search/listings/facets?type=VEHICLE&currency=EUR', 5],
  [
    'nearby',
    '/api/v1/listings?type=VEHICLE&lat=52.37&lng=4.9&radiusMeters=100000&sort=distance&limit=20',
    12,
  ],
  ['detail', '/api/v1/listings/60000000-0000-4000-8000-000000000002', 15],
  [
    'partsCompatibility',
    `/api/v1/listings?type=PART&compatibleModelId=20000000-0000-4000-8000-000000000001&compatibleYear=2022&limit=20`,
    8,
  ],
  ['favorites', '/api/v1/me/favorites?limit=20', 8],
  ['notifications', '/api/v1/me/notifications?limit=20', 8],
  [
    'messages',
    '/api/v1/me/conversations/70000000-0000-4000-8000-000000000001/messages?limit=20',
    8,
  ],
  ...(profileName === 'smoke' ? [['auth', '/api/v1/auth/login', 2]] : []),
];
const weighted = scenarios.flatMap((scenario) =>
  Array(scenario[2]).fill(scenario),
);
const deadline = performance.now() + duration * 1000;
async function worker(workerId) {
  while (performance.now() < deadline) {
    const [name, path] = weighted[sequence++ % weighted.length];
    const start = performance.now();
    let status;
    try {
      const isAuth = name === 'auth';
      const clientIp = `10.${workerId % 250}.${Math.floor(sequence / 250) % 250}.${(sequence % 249) + 1}`;
      const response = await fetch(base + path, {
        method: isAuth ? 'POST' : 'GET',
        headers: isAuth
          ? {
              'content-type': 'application/json',
              origin: process.env.WEB_URL ?? 'http://127.0.0.1:3200',
              'x-forwarded-for': clientIp,
            }
          : ['favorites', 'notifications', 'messages'].includes(name)
            ? {
                authorization: `Bearer ${token}`,
                'x-forwarded-for': clientIp,
              }
            : { 'x-forwarded-for': clientIp },
        body: isAuth
          ? JSON.stringify({ email: 'buyer@example.test', password })
          : undefined,
        signal: AbortSignal.timeout(10_000),
      });
      status = response.status;
      await response.arrayBuffer();
    } catch {
      status = -1;
    }
    samples.push({ name, status, durationMs: performance.now() - start });
  }
}
await Promise.all(
  Array.from({ length: concurrency }, (_, index) => worker(index)),
);
const runtimeReport = await runtime.stop();
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(
    (
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
    ).toFixed(2),
  );
};
const summary = {};
for (const [name] of scenarios) {
  const rows = samples.filter((sample) => sample.name === name);
  const accepted = rows.filter((row) => row.status >= 200 && row.status < 400);
  const times = accepted.map((row) => row.durationMs);
  summary[name] = {
    requests: rows.length,
    accepted: accepted.length,
    p50Ms: percentile(times, 0.5),
    p95Ms: percentile(times, 0.95),
    p99Ms: percentile(times, 0.99),
    errors: rows.filter(
      (row) => row.status < 200 || (row.status >= 400 && row.status !== 429),
    ).length,
    clientErrors: rows.filter(
      (row) => row.status >= 400 && row.status < 500 && row.status !== 429,
    ).length,
    serverErrors: rows.filter((row) => row.status >= 500).length,
    throttled: rows.filter((row) => row.status === 429).length,
  };
}
const unexpectedErrors = samples.filter(
  (row) => row.status < 200 || (row.status >= 400 && row.status !== 429),
).length;
const acceptedRequests = samples.filter(
  (row) => row.status >= 200 && row.status < 400,
).length;
const throttledRequests = samples.filter((row) => row.status === 429).length;
const report = {
  schemaVersion: 1,
  profile: profileName,
  startedAt: new Date(Date.now() - duration * 1000).toISOString(),
  durationSeconds: duration,
  concurrency,
  datasetListings: Number(process.env.LOAD_DATASET_SIZE ?? 20_000),
  totalRequests: samples.length,
  requestsPerSecond: Number((samples.length / duration).toFixed(2)),
  acceptedRequestsPerSecond: Number((acceptedRequests / duration).toFixed(2)),
  throttledRate: Number((throttledRequests / samples.length).toFixed(5)),
  unexpectedErrorRate: Number((unexpectedErrors / samples.length).toFixed(5)),
  environment: {
    platform: os.platform(),
    release: os.release(),
    cpuModel: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    node: process.version,
    postgres: runtimeReport.postgresVersion,
    redis: runtimeReport.redisVersion,
  },
  runtime: runtimeReport,
  summary,
};
mkdirSync(resolve('qa-results'), { recursive: true });
writeFileSync(
  resolve('qa-results', `load-${profileName}.json`),
  JSON.stringify(report, null, 2),
);
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (report.unexpectedErrorRate > 0.01) process.exitCode = 1;

async function startRuntimeObservation(accessToken, renewAccess) {
  if (profileName !== 'soak')
    return {
      stop: async () => ({
        postgresVersion: null,
        redisVersion: null,
        samples: [],
        monitoringErrors: [],
        realtime: null,
      }),
    };
  const database = new pg.Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  const redis = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
    password: process.env.REDIS_PASSWORD,
  });
  await Promise.all([database.connect(), redis.connect()]);
  const postgresVersion = (await database.query('SHOW server_version')).rows[0]
    .server_version;
  const redisInfo = await redis.info('server');
  const redisVersion = /redis_version:([^\r\n]+)/.exec(redisInfo)?.[1] ?? null;
  const samples = [];
  const monitoringErrors = [];
  const realtime = {
    requested: 10,
    currentConnected: 0,
    connections: 0,
    disconnects: 0,
    connectErrors: 0,
    plannedReconnects: 0,
  };
  const sockets = Array.from({ length: realtime.requested }, () => {
    const socket = io(`${base}/realtime`, {
      transports: ['websocket'],
      auth: { accessToken },
      extraHeaders: {
        origin: process.env.WEB_URL ?? 'http://127.0.0.1:3200',
      },
      reconnection: true,
    });
    socket.on('connect', () => {
      realtime.currentConnected += 1;
      realtime.connections += 1;
    });
    socket.on('disconnect', () => {
      realtime.currentConnected = Math.max(0, realtime.currentConnected - 1);
      realtime.disconnects += 1;
    });
    socket.on('connect_error', () => {
      realtime.connectErrors += 1;
    });
    return socket;
  });
  let sampling = false;
  const observationStartedAt = performance.now();
  async function sample() {
    if (sampling) return;
    sampling = true;
    try {
      const [connections, queues, redisClients] = await Promise.all([
        database.query(`SELECT count(*)::integer AS total,
          count(*) FILTER (WHERE state = 'active')::integer AS active,
          count(*) FILTER (WHERE state = 'idle')::integer AS idle,
          count(*) FILTER (WHERE wait_event IS NOT NULL)::integer AS waiting
          FROM pg_stat_activity WHERE datname = current_database()`),
        database.query(`SELECT
          (SELECT count(*)::integer FROM outbox_events WHERE status IN ('PENDING','RETRY','PROCESSING')) AS outbox,
          (SELECT count(*)::integer FROM notification_deliveries WHERE status IN ('PENDING','RETRY','PROCESSING')) AS deliveries,
          (SELECT count(*)::integer FROM listing_media WHERE status IN ('PENDING','PROCESSING')) AS media`),
        redis.info('clients'),
      ]);
      samples.push({
        elapsedSeconds: Number(
          ((performance.now() - observationStartedAt) / 1000).toFixed(1),
        ),
        database: connections.rows[0],
        redis: {
          connectedClients:
            Number(/connected_clients:([^\r\n]+)/.exec(redisClients)?.[1]) || 0,
          blockedClients:
            Number(/blocked_clients:([^\r\n]+)/.exec(redisClients)?.[1]) || 0,
        },
        queues: queues.rows[0],
        processes: Object.fromEntries(
          [
            ['api', process.env.API_PID],
            ['media', process.env.MEDIA_WORKER_PID],
            ['engagement', process.env.ENGAGEMENT_WORKER_PID],
            ['delivery', process.env.DELIVERY_WORKER_PID],
          ].map(([name, pid]) => [name, processSnapshot(pid)]),
        ),
      });
    } catch (error) {
      monitoringErrors.push(
        error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      );
    } finally {
      sampling = false;
    }
  }
  await sample();
  const timer = setInterval(() => void sample(), 30_000);
  const tokenTimer = setInterval(() => {
    void renewAccess()
      .then((nextToken) => {
        for (const socket of sockets) {
          socket.auth = { accessToken: nextToken };
          socket.disconnect().connect();
          realtime.plannedReconnects += 1;
        }
      })
      .catch((error) =>
        monitoringErrors.push(
          error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        ),
      );
  }, 480_000);
  return {
    stop: async () => {
      clearInterval(timer);
      clearInterval(tokenTimer);
      await sample();
      const realtimeAtEnd = { ...realtime };
      sockets.forEach((socket) => socket.close());
      await Promise.allSettled([database.end(), redis.quit()]);
      return {
        postgresVersion,
        redisVersion,
        samples,
        monitoringErrors,
        realtime: realtimeAtEnd,
      };
    },
  };
}

function processSnapshot(rawPid) {
  const pid = Number(rawPid);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform !== 'win32') return null;
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-Process -Id ${pid} | Select-Object WorkingSet64,HandleCount) | ConvertTo-Json -Compress`,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    const value = JSON.parse(result.stdout);
    return {
      rssBytes: value.WorkingSet64,
      handles: value.HandleCount,
    };
  } catch {
    return null;
  }
}
