import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticationGuard, CurrentPrincipal } from '../../auth';
import type { AuthenticatedPrincipal } from '../../auth';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import { EmptyBodyPipe } from '../../../platform/http/empty-body.pipe';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import { MediaCommands } from '../application/media-commands';
import {
  InitializeMediaInput,
  InitializeMediaResponse,
  MediaListResponse,
  MediaOrderInput,
} from './media.dto';
@Controller({ path: 'me/listings/:listingId/media', version: '1' })
@UseGuards(AuthenticationGuard, RequestRateGuard)
@ApiBearerAuth()
@ApiTags('Listing photos')
@ApiResponse({
  status: 400,
  type: ApiErrorResponse,
  description:
    'VALIDATION_ERROR, MEDIA_FILE_TOO_LARGE, MEDIA_INVALID_IMAGE, MEDIA_UNSUPPORTED_TYPE, MEDIA_OBJECT_NOT_FOUND, MEDIA_INVALID_ORDER',
})
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 403, type: ApiErrorResponse })
@ApiResponse({
  status: 404,
  type: ApiErrorResponse,
  description:
    'LISTING_NOT_FOUND or MEDIA_NOT_FOUND; foreign resources also return 404',
})
@ApiResponse({
  status: 409,
  type: ApiErrorResponse,
  description:
    'MEDIA_LIMIT_EXCEEDED, LISTING_MEDIA_LOCKED, MEDIA_UPLOAD_EXPIRED, MEDIA_NOT_READY, MEDIA_INVALID_STATE',
})
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({
  status: 503,
  type: ApiErrorResponse,
  description: 'MEDIA_STORAGE_UNAVAILABLE or RATE_LIMIT_UNAVAILABLE',
})
export class MediaController {
  constructor(
    @Inject(MediaCommands) private readonly commands: MediaCommands,
  ) {}
  @Get()
  @RequestRate('listingSeller')
  @ApiOkResponse({ type: MediaListResponse })
  list(
    @Param('listingId', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.commands.list(id, principal.userId);
  }
  @Post('uploads')
  @ApiBody({ type: InitializeMediaInput })
  @RequestRate('mediaUpload')
  @ApiCreatedResponse({
    type: InitializeMediaResponse,
    description:
      'Direct PUT authorization for JPEG/PNG/WebP; configured limits are available from GET media',
  })
  initialize(
    @Param('listingId', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: InitializeMediaInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.commands.initialize(id, principal.userId, input);
  }
  @Post(':mediaId/complete')
  @HttpCode(200)
  @RequestRate('mediaComplete')
  @ApiOkResponse({
    type: MediaListResponse,
    description: 'Idempotent completion; image decoding happens in the worker',
  })
  complete(
    @Param('listingId', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new EmptyBodyPipe()) _body: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.commands.complete(id, mediaId, principal.userId);
  }
  @Put('order')
  @ApiBody({ type: MediaOrderInput })
  @RequestRate('listingWrite')
  @ApiOkResponse({ type: MediaListResponse })
  order(
    @Param('listingId', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: MediaOrderInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.commands.reorder(id, principal.userId, input.mediaIds);
  }
  @Put(':mediaId/primary')
  @RequestRate('listingWrite')
  @ApiOkResponse({ type: MediaListResponse })
  primary(
    @Param('listingId', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new EmptyBodyPipe()) _body: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.commands.primary(id, mediaId, principal.userId);
  }
  @Delete(':mediaId')
  @RequestRate('listingWrite')
  @ApiOkResponse({
    type: MediaListResponse,
    description:
      'Removes photo from the gallery immediately; storage cleanup is asynchronous',
  })
  delete(
    @Param('listingId', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(new EmptyBodyPipe()) _body: object,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.commands.delete(id, mediaId, principal.userId);
  }
}
