import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { io } from 'socket.io-client';

const root = resolve(import.meta.dirname, '..');
const base = process.env.API_URL ?? 'http://127.0.0.1:4200';
const origin = process.env.WEB_URL ?? 'http://127.0.0.1:3200';
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const compose = [
  'compose',
  '-p',
  'marketplace-e2e',
  '--env-file',
  resolve(root, '.env.e2e.example'),
];
const replacements = [];
const observations = [];
const pendingSamples = [];
let running = true;
let requestSequence = 0;

const token = await login();
const realtime = { connects: 0, disconnects: 0, connectErrors: 0 };
const socket = io(`${base}/realtime`, {
  transports: ['websocket'],
  auth: { accessToken: token },
  extraHeaders: { origin },
  reconnection: true,
  reconnectionDelay: 250,
  reconnectionDelayMax: 2000,
});
socket.on('connect', () => {
  realtime.connects += 1;
});
socket.on('disconnect', () => {
  realtime.disconnects += 1;
});
socket.on('connect_error', () => {
  realtime.connectErrors += 1;
});
await waitFor(`${base}/api/v1/health/ready`);
await waitForSocketConnect();
const traffic = requestLoop();

try {
  await fault('api', async () => {
    stopPid(process.env.API_PID);
    await delay(500);
    const child = startNode('apps/api/dist/main.js');
    process.env.API_PID = String(child.pid);
    await waitFor(`${base}/api/v1/health/ready`);
  });
  await fault('redis', async () => {
    composeRun(['stop', 'redis']);
    await delay(750);
    composeRun(['up', '-d', '--wait', 'redis']);
    await waitFor(`${base}/api/v1/health/ready`);
  });
  await fault('postgres', async () => {
    composeRun(['stop', 'postgres']);
    await delay(750);
    composeRun(['up', '-d', '--wait', 'postgres']);
    await waitFor(`${base}/api/v1/health/ready`);
  });
  await fault('engagement-worker', async () => {
    stopPid(process.env.ENGAGEMENT_WORKER_PID);
    await delay(500);
    const child = startNode('apps/api/dist/main-engagement-worker.js');
    process.env.ENGAGEMENT_WORKER_PID = String(child.pid);
    await delay(1000);
  });
} finally {
  running = false;
  await traffic;
}

await waitFor(`${base}/api/v1/health/ready`);
await waitForRealtimeReconnect();
await delay(1500);
const recoveryStatuses = await Promise.all(
  Array.from({ length: 20 }, () => probe()),
);
const integrity = await integrityCheck();
const report = {
  schemaVersion: 1,
  observations,
  traffic: summarize(observations.flatMap((item) => item.samples)),
  recovery: {
    successful: recoveryStatuses.filter((status) => status === 200).length,
    attempted: recoveryStatuses.length,
  },
  realtime,
  integrity,
};
socket.close();
for (const child of replacements) stopPid(String(child.pid));
mkdirSync(resolve(root, 'qa-results'), { recursive: true });
writeFileSync(
  resolve(root, 'qa-results/fault-under-load.json'),
  JSON.stringify(report, null, 2),
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.recovery.successful !== report.recovery.attempted)
  process.exitCode = 1;
if (Object.values(integrity).some((value) => value !== 0)) process.exitCode = 1;
if (realtime.connects < 2) process.exitCode = 1;
if (report.traffic.unexpected !== 0) process.exitCode = 1;

async function fault(name, action) {
  const before = requestSequence;
  const started = performance.now();
  await action();
  await delay(1000);
  observations.push({
    name,
    durationMs: Number((performance.now() - started).toFixed(2)),
    samples: pendingSamples.splice(0),
    requestsBefore: before,
    requestsAfter: requestSequence,
  });
}

async function requestLoop() {
  while (running) {
    pendingSamples.push(await probe());
    requestSequence += 1;
    await delay(50);
  }
}

async function probe() {
  try {
    const response = await fetch(
      `${base}/api/v1/listings?type=VEHICLE&limit=1`,
      {
        headers: {
          'x-forwarded-for': `10.251.${Math.floor(requestSequence / 250) % 250}.${(requestSequence % 249) + 1}`,
        },
        signal: AbortSignal.timeout(2000),
      },
    );
    await response.arrayBuffer();
    return response.status;
  } catch {
    return -1;
  }
}

async function login() {
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      email: 'buyer@example.test',
      password: 'Marketplace-e2e-password-2026!',
    }),
  });
  if (!response.ok)
    throw new Error(`Fault-load login failed: ${response.status}`);
  return (await response.json()).accessToken;
}

function composeRun(args) {
  const result = spawnSync(docker, [...compose, ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(`Docker compose ${args.join(' ')} failed`);
}

function startNode(script) {
  const child = spawn(process.execPath, [resolve(root, script)], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) =>
    process.stdout.write(`[replacement] ${chunk}`),
  );
  child.stderr.on('data', (chunk) =>
    process.stderr.write(`[replacement] ${chunk}`),
  );
  replacements.push(child);
  return child;
}

function stopPid(rawPid) {
  const pid = Number(rawPid);
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error('Missing process PID');
  if (process.platform === 'win32')
    spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
    });
  else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process already exited during the injected fault.
    }
  }
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      // Dependency recovery is expected to take several polls.
    }
    await delay(250);
  }
  throw new Error(`${url} did not recover`);
}

async function waitForSocketConnect() {
  if (socket.connected) return;
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Initial realtime connection timed out')),
      10_000,
    );
    socket.once('connect', () => {
      globalThis.clearTimeout(timeout);
      resolvePromise();
    });
  });
}

async function waitForRealtimeReconnect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (socket.connected && realtime.connects >= 2) return;
    await delay(250);
  }
  throw new Error('Realtime client did not reconnect after API restart');
}

async function integrityCheck() {
  const database = new pg.Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  await database.connect();
  try {
    const result = await database.query(`SELECT
      (SELECT count(*)::integer FROM vehicle_listings typed LEFT JOIN listings listing ON listing.id=typed.listing_id WHERE listing.id IS NULL OR listing.type <> 'VEHICLE') AS vehicle_type_errors,
      (SELECT count(*)::integer FROM part_listings typed LEFT JOIN listings listing ON listing.id=typed.listing_id WHERE listing.id IS NULL OR listing.type <> 'PART') AS part_type_errors,
      (SELECT count(*)::integer FROM messages message LEFT JOIN conversations conversation ON conversation.id=message.conversation_id WHERE conversation.id IS NULL) AS message_orphans,
      (SELECT count(*)::integer FROM notification_deliveries delivery LEFT JOIN users account ON account.id=delivery.user_id WHERE account.id IS NULL) AS delivery_orphans`);
    return Object.fromEntries(
      Object.entries(result.rows[0]).map(([key, value]) => [
        key,
        Number(value),
      ]),
    );
  } finally {
    await database.end();
  }
}

function summarize(statuses) {
  return {
    successful: statuses.filter((status) => status === 200).length,
    unavailable: statuses.filter((status) => status === -1 || status >= 500)
      .length,
    unexpected: statuses.filter(
      (status) => status !== 200 && status !== -1 && status < 500,
    ).length,
  };
}

function delay(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}
