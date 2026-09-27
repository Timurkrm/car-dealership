import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthenticationGuard, CurrentPrincipal } from '../../auth';
import type { AuthenticatedPrincipal } from '../../auth';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import { ListingCommands } from '../application/listing-commands';
import { ListingQueries } from '../application/listing-queries';
import {
  CreatePartListingInput,
  UpdatePartListingInput,
  OwnerPartListingResponse,
  PublicPartListingResponse,
} from './part-listing.dto';
import { expectedListingVersion } from './listing-precondition';
import { ownerResponse } from './listings.controller';

@Controller({ path: 'parts/listings', version: '1' })
@ApiTags('Part Listings')
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 404, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({ status: 503, type: ApiErrorResponse })
export class PartListingsController {
  constructor(
    @Inject(ListingCommands) private readonly commands: ListingCommands,
    @Inject(ListingQueries) private readonly queries: ListingQueries,
  ) {}
  @Get(':id')
  @UseGuards(RequestRateGuard)
  @RequestRate('listingPublic')
  @ApiOkResponse({
    type: PublicPartListingResponse,
    description:
      'PART PUBLISHED or historical SOLD; exact coordinates/private seller data omitted.',
  })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.queries.publicPartDetail(id);
  }
  @Post()
  @UseGuards(AuthenticationGuard, RequestRateGuard)
  @RequestRate('listingCreate')
  @ApiBearerAuth()
  @ApiCreatedResponse({
    type: OwnerPartListingResponse,
    headers: { ETag: { schema: { type: 'string', example: '"1"' } } },
  })
  @ApiResponse({ status: 401, type: ApiErrorResponse })
  @ApiResponse({ status: 403, type: ApiErrorResponse })
  @ApiBody({ type: CreatePartListingInput })
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreatePartListingInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const listing = await this.commands.createPart(principal.userId, input);
    response.setHeader('Location', '/api/v1/me/listings/' + listing.id);
    return ownerResponse(response, listing);
  }
}
@Controller({ path: 'me/part-listings', version: '1' })
@ApiTags('Part Listings')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, RequestRateGuard)
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 403, type: ApiErrorResponse })
@ApiResponse({ status: 404, type: ApiErrorResponse })
@ApiResponse({
  status: 409,
  type: ApiErrorResponse,
  description: 'Version conflict or immutable listing state.',
})
@ApiResponse({
  status: 428,
  type: ApiErrorResponse,
  description: 'If-Match required.',
})
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({ status: 503, type: ApiErrorResponse })
export class SellerPartListingsController {
  constructor(
    @Inject(ListingCommands) private readonly commands: ListingCommands,
  ) {}
  @Patch(':id')
  @ApiBody({ type: UpdatePartListingInput })
  @RequestRate('listingWrite')
  @ApiHeader({
    name: 'If-Match',
    required: true,
    description: 'Quoted integer ETag from GET /me/listings/:id.',
  })
  @ApiOkResponse({
    type: OwnerPartListingResponse,
    headers: { ETag: { schema: { type: 'string' } } },
    description:
      'PART DRAFT/REJECTED only. Partial common/part fields; fitment and location are full replacements, location may be null. Shared lifecycle/media endpoints remain /me/listings/:id/….',
  })
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: UpdatePartListingInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    return ownerResponse(
      response,
      await this.commands.updatePart(
        id,
        principal.userId,
        expectedListingVersion(version),
        input,
      ),
    );
  }
}
