const { fetch, AbortSignal } = globalThis;
const origin = (process.env.SMOKE_API_URL ?? process.env.API_URL ?? '').replace(
  /\/$/,
  '',
);
if (!/^https?:\/\/[^/]+$/i.test(origin))
  throw new Error('Set SMOKE_API_URL to the deployed API origin');

for (const path of [
  '/api/v1/health',
  '/api/v1/health/ready',
  '/api/v1/listings?limit=1',
  '/api/v1/catalog/vehicle-makes?limit=1',
]) {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
    headers: { 'x-request-id': `production-smoke-${Date.now()}` },
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Smoke check failed: ${path}`);
  process.stdout.write(`PASS ${path}\n`);
}
