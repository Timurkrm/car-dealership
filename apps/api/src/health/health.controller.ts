import { Controller, Get, Inject, Res } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';
import type { ReadinessResult } from './health.service';

export class HealthResponse {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}
export class ReadinessResponse {
  @ApiProperty({ enum: ['ok', 'unavailable'] }) status!: 'ok' | 'unavailable';
}
@ApiTags('health')
@ApiHeader({
  name: 'x-request-id',
  required: false,
  description:
    '8–64 ASCII letters, digits, underscores or hyphens; invalid values are replaced',
})
@ApiResponse({
  status: 200,
  headers: {
    'x-request-id': {
      schema: { type: 'string' },
      description: 'Request correlation ID',
    },
  },
})
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}
  @Get()
  @ApiOkResponse({
    type: HealthResponse,
    description: 'Process is alive; does not probe infrastructure',
  })
  live(): HealthResponse {
    return { status: 'ok' };
  }
  @Get('ready')
  @ApiOkResponse({
    type: ReadinessResponse,
    description:
      'The process can safely serve traffic and writable PostGIS is available',
  })
  @ApiServiceUnavailableResponse({
    type: ReadinessResponse,
    description: 'A required dependency is unavailable',
  })
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResult> {
    const result = await this.health.ready();
    response.setHeader('cache-control', 'no-store');
    response.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
