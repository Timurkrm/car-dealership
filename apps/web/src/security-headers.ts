export function webSecurityHeaders(
  apiUrl: string,
  mapStyleUrl?: string,
): Array<{ key: string; value: string }> {
  const apiOrigin = new URL(apiUrl).origin;
  const websocketOrigin = apiOrigin.replace(/^http/, 'ws');
  const mapOrigin = mapStyleUrl ? new URL(mapStyleUrl).origin : undefined;
  const connectSources = ["'self'", apiOrigin, websocketOrigin, mapOrigin]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connectSources}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "worker-src 'self' blob:",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
    },
  ];
}
