import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import { EmptyBodyPipe } from '../../../platform/http/empty-body.pipe';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import {
  AuthenticationGuard,
  CurrentPrincipal,
  RequireRoles,
  RolesGuard,
  type AuthenticatedPrincipal,
} from '../../auth';
import { expectedListingVersion } from '../../listings';
import { ListingModerationService } from '../application/listing-moderation.service';
import { ReportModerationService } from '../application/report-moderation.service';
import {
  CreateReportInput,
  ModerationListingQuery,
  RejectListingInput,
  RemoveListingInput,
  ReportQueueQuery,
  ResolveReportInput,
} from './moderation.dto';

const moderationModels = [
  CreateReportInput,
  ModerationListingQuery,
  RejectListingInput,
  RemoveListingInput,
  ReportQueueQuery,
  ResolveReportInput,
] as const;

@Controller({ path: 'reports', version: '1' })
@ApiTags('Reports')
@ApiBearerAuth()
@ApiExtraModels(...moderationModels)
@UseGuards(AuthenticationGuard, RequestRateGuard)
export class ReportsController {
  constructor(
    @Inject(ReportModerationService)
    private readonly reports: ReportModerationService,
  ) {}

  @Post()
  @RequestRate('reportWrite')
  @ApiResponse({
    status: 201,
    description:
      'Authenticated report accepted; one active report per reporter/target.',
  })
  @ApiResponse({ status: 400, type: ApiErrorResponse })
  @ApiResponse({ status: 401, type: ApiErrorResponse })
  @ApiResponse({ status: 409, type: ApiErrorResponse })
  @ApiResponse({ status: 429, type: ApiErrorResponse })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateReportInput,
  ) {
    return this.reports.create(principal, input);
  }
}

@Controller({ path: 'moderation/listings', version: '1' })
@ApiTags('Moderation Listings')
@ApiBearerAuth()
@ApiExtraModels(...moderationModels)
@RequireRoles('MODERATOR', 'ADMIN')
@UseGuards(AuthenticationGuard, RolesGuard, RequestRateGuard)
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 403, type: ApiErrorResponse })
export class ModerationListingsController {
  constructor(
    @Inject(ListingModerationService)
    private readonly listings: ListingModerationService,
  ) {}

  @Get()
  @RequestRate('moderationRead')
  @ApiOperation({
    summary: 'Oldest-first PENDING_MODERATION queue for Cars and Parts',
  })
  @ApiOkResponse({
    description:
      'Compact queue with signed cursor pagination; no VIN or exact point.',
  })
  queue(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ModerationListingQuery,
  ) {
    return this.listings.queue(principal, query);
  }

  @Get(':id')
  @RequestRate('moderationRead')
  @ApiOkResponse({
    description:
      'Privileged detail. VIN and exactPoint may be present and are internal/private.',
  })
  async detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.listings.detail(principal, id);
    response.setHeader('ETag', `"${result.version}"`);
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequestRate('moderationWrite')
  @ApiHeader({
    name: 'If-Match',
    required: true,
    description: 'Quoted listing version from moderation detail.',
  })
  @ApiBody({
    schema: { type: 'object', additionalProperties: false, example: {} },
  })
  @ApiOkResponse({
    description:
      'Atomically publishes, records history/audit and persists seller notification.',
  })
  async approve(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body(EmptyBodyPipe) _body: undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.listings.approve(
      principal,
      id,
      expectedListingVersion(version),
    );
    response.setHeader('ETag', `"${result.version}"`);
    return result;
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequestRate('moderationWrite')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({
    description:
      'Rejects with seller-visible reason/message and optional internal note.',
  })
  async reject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: RejectListingInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.listings.reject(
      principal,
      id,
      expectedListingVersion(version),
      input,
    );
    response.setHeader('ETag', `"${result.version}"`);
    return result;
  }

  @Post(':id/remove')
  @HttpCode(200)
  @RequestRate('moderationWrite')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({
    description:
      'Archives a published listing as an explicit moderator removal.',
  })
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: RemoveListingInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.listings.remove(
      principal,
      id,
      expectedListingVersion(version),
      input,
    );
    response.setHeader('ETag', `"${result.version}"`);
    return result;
  }
}

@Controller({ path: 'moderation/reports', version: '1' })
@ApiTags('Moderation Reports')
@ApiBearerAuth()
@ApiExtraModels(...moderationModels)
@RequireRoles('MODERATOR', 'ADMIN')
@UseGuards(AuthenticationGuard, RolesGuard, RequestRateGuard)
export class ModerationReportsController {
  constructor(
    @Inject(ReportModerationService)
    private readonly reports: ReportModerationService,
  ) {}

  @Get()
  @RequestRate('moderationRead')
  @ApiOkResponse({
    description: 'Oldest-first report queue with signed cursor pagination.',
  })
  queue(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ReportQueueQuery,
  ) {
    return this.reports.queue(principal, query);
  }

  @Get(':id')
  @RequestRate('moderationRead')
  @ApiOkResponse({
    description:
      'Report, bounded target context, related count and moderation history.',
  })
  detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.detail(principal, id);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequestRate('moderationWrite')
  @ApiOkResponse({
    description:
      'Finalizes once. CONTENT_REMOVED atomically removes its listing target.',
  })
  resolve(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResolveReportInput,
  ) {
    return this.reports.resolve(principal, id, input);
  }
}

@Controller({ path: 'me/listings', version: '1' })
@ApiTags('Seller Listings')
@ApiBearerAuth()
@ApiExtraModels(...moderationModels)
@UseGuards(AuthenticationGuard, RequestRateGuard)
export class SellerModerationResultController {
  constructor(
    @Inject(ListingModerationService)
    private readonly listings: ListingModerationService,
  ) {}

  @Get(':id/moderation-result')
  @RequestRate('listingSeller')
  @ApiOkResponse({
    description:
      'Seller-safe latest result: no moderator identity or internal note.',
  })
  result(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.listings.sellerResult(principal, id);
  }
}
