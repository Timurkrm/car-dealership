import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/config';
import { StructuredLogger } from './platform/logging/structured-logger';
import { requestMiddleware } from './platform/http/request-context';
import { ApiExceptionFilter } from './platform/http/api-exception.filter';
import { validationPipe } from './platform/http/validation';
import { ApiErrorResponse } from './platform/http/api-error';

export function configureApp(app: INestApplication, config: AppConfig): void {
  const logger = app.get(StructuredLogger);
  if (config.runtime.trustProxyHops > 0) {
    const express = app.getHttpAdapter().getInstance() as {
      set(setting: string, value: number): void;
    };
    express.set('trust proxy', config.runtime.trustProxyHops);
  }
  app.useLogger(logger);
  app.use(requestMiddleware(logger, config.runtime.slowRequestMs));
  app.use(helmet());
  app.enableCors({
    origin: config.webUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'If-Match',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'ETag'],
    maxAge: 600,
  });
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter(logger));
  if (config.swagger) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Vehicle Marketplace API')
        .setDescription(
          'Cars and Parts marketplace with browser authentication, private media, Search/Geo/Map, moderation and administration.',
        )
        .setVersion('1.0.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
        .addCookieAuth('marketplace_refresh')
        .build(),
      { extraModels: [ApiErrorResponse] },
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
      swaggerOptions: { persistAuthorization: false },
    });
  }
}
