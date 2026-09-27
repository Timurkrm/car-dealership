import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ApiException } from './api-error';
import type { ValidationDetail } from './api-error';

function details(errors: ValidationError[], prefix = ''): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = `${prefix}${error.property}`;
    return [
      ...(error.constraints
        ? [{ field, rules: Object.keys(error.constraints) }]
        : []),
      ...details(error.children ?? [], `${field}.`),
    ];
  });
}
export function validationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new ApiException(
        400,
        'VALIDATION_ERROR',
        'Request validation failed',
        details(errors),
      ),
  });
}
