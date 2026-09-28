import { io } from 'socket.io-client';
import { clearTimeout } from 'node:timers';

const origin = requiredOrigin('SMOKE_API_URL');
const webOrigin = requiredOrigin('SMOKE_WEB_URL');
const email = required('SMOKE_ACCOUNT_EMAIL');
const password = required('SMOKE_ACCOUNT_PASSWORD');
const allowSelfSigned = process.env.SMOKE_ALLOW_SELF_SIGNED === 'true';
if (allowSelfSigned) configureLocalTls([origin, webOrigin]);
const { fetch, AbortSignal } = globalThis;

const login = await fetch(`${origin}/api/v1/auth/login`, {
  method: 'POST',
  signal: AbortSignal.timeout(8000),
  headers: {
    origin: webOrigin,
    'content-type': 'application/json',
    'x-request-id': `authenticated-smoke-${Date.now()}`,
  },
  body: JSON.stringify({ email, password }),
});
if (!login.ok)
  throw new Error(`Authenticated smoke login failed (${login.status})`);
const grant = await login.json();
const accessToken = grant?.accessToken;
if (typeof accessToken !== 'string')
  throw new Error('Authenticated smoke did not receive an access token');

for (const path of [
  '/api/v1/auth/me',
  '/api/v1/me/notifications?limit=1',
  '/api/v1/me/conversations?limit=1',
]) {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${accessToken}` },
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Authenticated smoke failed: ${path}`);
  process.stdout.write(`PASS ${path}\n`);
}

await new Promise((resolve, reject) => {
  const socket = io(`${origin}/realtime`, {
    transports: ['websocket'],
    auth: { accessToken },
    extraHeaders: { origin: webOrigin },
    timeout: 5000,
    reconnection: false,
    rejectUnauthorized: !allowSelfSigned,
    transportOptions: {
      websocket: { rejectUnauthorized: !allowSelfSigned },
    },
  });
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error('Authenticated WebSocket smoke timed out'));
  }, 8000);
  socket.once('connect', () => {
    clearTimeout(timer);
    socket.close();
    process.stdout.write('PASS /realtime authenticated WebSocket\n');
    resolve();
  });
  socket.once('connect_error', () => {
    clearTimeout(timer);
    socket.close();
    reject(new Error('Authenticated WebSocket smoke failed'));
  });
});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredOrigin(name) {
  const value = required(name).replace(/\/$/, '');
  if (!/^https?:\/\/[^/]+$/i.test(value))
    throw new Error(`${name} must be an HTTP(S) origin`);
  return value;
}

function configureLocalTls(origins) {
  for (const value of origins) {
    const target = new URL(value);
    if (
      target.protocol !== 'https:' ||
      !['localhost', '127.0.0.1', '::1'].includes(target.hostname)
    )
      throw new Error(
        'SMOKE_ALLOW_SELF_SIGNED is restricted to local HTTPS origins',
      );
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
