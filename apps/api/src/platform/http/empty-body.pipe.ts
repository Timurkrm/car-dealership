import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ApiException } from './api-error';

@Injectable()
export class EmptyBodyPipe implements PipeTransform<unknown, undefined> {
  transform(value: unknown): undefined {
    if (
      value !== undefined &&
      (value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).length !== 0)
    )
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'This endpoint accepts an empty body only',
      );
    return undefined;
  }
}
