import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { StructuredLogger } from '../logging/structured-logger';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
export function resolveRequestId(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)
    ? value
    : randomUUID();
}
export function requestMiddleware(
  logger: StructuredLogger,
  slowRequestMs = Number.POSITIVE_INFINITY,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    const start = performance.now();
    res.setHeader('x-request-id', requestId);
    res.on('finish', () => {
      const durationMs = Math.round(performance.now() - start);
      const route = routeTemplate(req);
      const fields = {
        requestId,
        operation: `http_${req.method.toLowerCase()}`,
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs,
      };
      logger.event('info', 'HTTP request completed', fields);
      if (durationMs >= slowRequestMs)
        logger.event('warn', 'Slow HTTP request', {
          ...fields,
          operation: 'http_slow',
        });
    });
    requestContext.run({ requestId }, next);
  };
}

function routeTemplate(req: Request): string {
  const path: unknown = req.route?.path;
  if (typeof path === 'string') return `${req.baseUrl}${path}` || '/';
  return 'unmatched';
}
