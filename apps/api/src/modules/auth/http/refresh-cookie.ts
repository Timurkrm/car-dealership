import type { CookieOptions, Request, Response } from 'express';
import type { AuthConfig } from '../../../config/auth-config';
import { ApiException } from '../../../platform/http/api-error';
import { validSecret } from '../infrastructure/crypto/auth-tokens';

export const REFRESH_COOKIE = 'marketplace_refresh';
export function cookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/api/v1/auth',
  };
}
export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  if (header.length > 8192)
    throw new ApiException(400, 'INVALID_COOKIE', 'Invalid cookie');
  const matches = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${REFRESH_COOKIE}=`));
  if (matches.length > 1)
    throw new ApiException(400, 'INVALID_COOKIE', 'Ambiguous cookie');
  const value = matches[0]?.slice(REFRESH_COOKIE.length + 1);
  return value && validSecret(value) ? value : null;
}
export function setRefreshCookie(
  res: Response,
  config: AuthConfig,
  secret: string,
  expires: Date,
): void {
  res.cookie(REFRESH_COOKIE, secret, {
    ...cookieOptions(config),
    expires,
    maxAge: Math.max(0, expires.getTime() - Date.now()),
  });
}
export function clearRefreshCookie(res: Response, config: AuthConfig): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(config));
}
