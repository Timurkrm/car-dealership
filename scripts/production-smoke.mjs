const origin = (process.env.SMOKE_API_URL ?? process.env.API_URL ?? '').replace(
  /\/$/,
  '',
);
if (!/^https?:\/\/[^/]+$/i.test(origin))
  throw new Error('Set SMOKE_API_URL to the deployed API origin');
const webOrigin = (process.env.SMOKE_WEB_URL ?? '').replace(/\/$/, '');
configureLocalTls([origin, webOrigin]);
const { fetch, AbortSignal } = globalThis;

const paths = [
  '/api/v1/health',
  '/api/v1/health/ready',
  '/api/v1/listings?type=VEHICLE&limit=1',
  '/api/v1/listings?type=PART&limit=1',
  '/api/v1/catalog/vehicle-makes?limit=1',
  '/api/v1/catalog/part-categories?limit=1',
];

for (const path of paths) {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
    headers: { 'x-request-id': `production-smoke-${Date.now()}` },
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Smoke check failed: ${path}`);
  if (response.headers.get('x-content-type-options') !== 'nosniff')
    throw new Error(`Security header missing: ${path}`);
  process.stdout.write(`PASS ${path}\n`);
}

if (webOrigin) {
  const response = await fetch(`${webOrigin}/`, {
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Smoke check failed: web root');
  if (response.headers.get('x-content-type-options') !== 'nosniff')
    throw new Error('Web security header missing');
  process.stdout.write('PASS web root\n');
}

function configureLocalTls(origins) {
  if (process.env.SMOKE_ALLOW_SELF_SIGNED !== 'true') return;
  for (const value of origins.filter(Boolean)) {
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
