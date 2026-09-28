export function webSecurityHeaders(
  mapStyleUrl?: string,
  mediaOriginUrl?: string,
): Array<{ key: string; value: string }> {
  const mapOrigin = mapStyleUrl ? new URL(mapStyleUrl).origin : undefined;
  const mediaOrigin = mediaOriginUrl
    ? new URL(mediaOriginUrl).origin
    : undefined;
  const connectSources = ["'self'", mapOrigin]
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
    `img-src 'self' data: blob: https:${mediaOrigin ? ` ${mediaOrigin}` : ''}`,
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
