import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ApiException } from './api-error';
import type { StructuredLogger } from '../logging/structured-logger';
import { requestContext } from './request-context';
import { isDatabaseUnavailable } from '../database/database-unavailable';

const errors: Record<number, [string, string]> = {
  400: ['BAD_REQUEST', 'Invalid request'],
  401: ['UNAUTHORIZED', 'Authentication required'],
  403: ['FORBIDDEN', 'Access denied'],
  404: ['NOT_FOUND', 'Resource not found'],
  405: ['METHOD_NOT_ALLOWED', 'Method not allowed'],
  409: ['CONFLICT', 'Request conflicts with the current state'],
  413: ['PAYLOAD_TOO_LARGE', 'Request payload too large'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type'],
  429: ['RATE_LIMITED', 'Too many requests'],
  503: ['SERVICE_UNAVAILABLE', 'Service unavailable'],
};
function parserStatus(exception: unknown): number | undefined {
  if (
    typeof exception !== 'object' ||
    exception === null ||
    !('type' in exception)
  )
    return undefined;
  if (exception.type === 'entity.too.large') return 413;
  if (exception.type === 'entity.parse.failed') return 400;
  if (
    exception.type === 'encoding.unsupported' ||
    exception.type === 'charset.unsupported'
  )
    return 415;
  return undefined;
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = isDatabaseUnavailable(exception)
      ? 503
      : exception instanceof HttpException
        ? exception.getStatus()
        : (parserStatus(exception) ?? 500);
    const fallback = errors[status] ?? [
      'INTERNAL_ERROR',
      'Internal server error',
    ];
    const requestId =
      requestContext.getStore()?.requestId ??
      String(response.getHeader('x-request-id') ?? '');
    if (status >= 500)
      this.logger.event('error', 'HTTP request failed', {
        requestId,
        statusCode: status,
        operation: 'http_error',
        errorType:
          exception instanceof Error
            ? exception.constructor.name
            : 'UnknownError',
      });
    response.setHeader('cache-control', 'no-store');
    response.status(status).json({
      statusCode: status,
      code: exception instanceof ApiException ? exception.code : fallback[0],
      message:
        exception instanceof ApiException ? exception.safeMessage : fallback[1],
      details: exception instanceof ApiException ? exception.details : [],
      requestId,
    });
  }
}
