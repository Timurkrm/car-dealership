import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  OwnerPartListingResponse,
  OwnerPartListingSummary,
} from './part-listing.dto';
import type { MarketplaceOwner } from './part-listing.dto';
import { OwnerListingSummary } from './listing.dto';
import { AuthenticationGuard, CurrentPrincipal } from '../../auth';
import type { AuthenticatedPrincipal } from '../../auth';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import { EmptyBodyPipe } from '../../../platform/http/empty-body.pipe';
import { ListingCommands } from '../application/listing-commands';
import { ListingQueries } from '../application/listing-queries';
import {
  CreateListingInput,
  UpdateListingInput,
  OwnerListingResponse,
  OwnerListingPage,
  PublicListingResponse,
  SellerListQuery,
} from './listing.dto';
import { expectedListingVersion } from './listing-precondition';
import {
  OWNER_LISTING_EXAMPLE,
  PUBLIC_LISTING_EXAMPLE,
} from './listing.examples';

function MutationContract(action?: 'submit' | 'archive' | 'mark-sold') {
  const time = '2026-01-03T00:00:00.000Z';
  const example = {
    ...OWNER_LISTING_EXAMPLE,
    version: 2,
    status:
      action === 'submit'
        ? 'PENDING_MODERATION'
        : action === 'archive'
          ? 'ARCHIVED'
          : action === 'mark-sold'
            ? 'SOLD'
            : 'DRAFT',
    submittedAt: action === 'submit' ? time : null,
    archivedAt: action === 'archive' ? time : null,
    soldAt: action === 'mark-sold' ? time : null,
    publishedAt: action === 'mark-sold' ? '2026-01-02T00:00:00.000Z' : null,
    // This coordinate is synthetic and is not a seller/home location.
    location:
      action === 'submit'
        ? {
            city: 'Example city',
            region: null,
            countryCode: 'NL',
            publicPoint: null,
            exactPoint: { latitude: 0, longitude: 0 },
          }
        : null,
  };
  return applyDecorators(
    ApiHeader({
      name: 'If-Match',
      required: true,
      description:
        'ETag from the owner response; one quoted integer, e.g. "1".',
    }),
    ApiOkResponse({
      ...(action
        ? { schema: marketplaceOwnerSchema }
        : { type: OwnerListingResponse }),
      example,
      headers: { ETag: { schema: { type: 'string', example: '"2"' } } },
    }),
    ApiResponse({
      status: 428,
      type: ApiErrorResponse,
      description: 'LISTING_VERSION_REQUIRED',
    }),
    ApiResponse({
      status: 409,
      type: ApiErrorResponse,
      description: 'LISTING_VERSION_CONFLICT or invalid state',
      example: {
        statusCode: 409,
        code: 'LISTING_VERSION_CONFLICT',
        message: 'Listing changed; reload it before retrying',
        details: [],
        requestId: 'example-request',
      },
    }),
  );
}
export function ownerResponse<T extends MarketplaceOwner>(
  response: Response,
  listing: T,
): T {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('ETag', `"${listing.version}"`);
  return listing;
}
const marketplaceOwnerSchema = {
  oneOf: [
    { $ref: '#/components/schemas/OwnerListingResponse' },
    { $ref: '#/components/schemas/OwnerPartListingResponse' },
  ],
  discriminator: {
    propertyName: 'type',
    mapping: {
      VEHICLE: '#/components/schemas/OwnerListingResponse',
      PART: '#/components/schemas/OwnerPartListingResponse',
    },
  },
};

@Controller({ path: 'listings', version: '1' })
@ApiTags('Vehicle Listings')
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 404, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({ status: 503, type: ApiErrorResponse })
export class PublicListingsController {
  constructor(
    @Inject(ListingQueries) private readonly queries: ListingQueries,
    @Inject(ListingCommands) private readonly commands: ListingCommands,
  ) {}
  @Get(':id')
  @UseGuards(RequestRateGuard)
  @RequestRate('listingPublic')
  @ApiOkResponse({
    type: PublicListingResponse,
    example: PUBLIC_LISTING_EXAMPLE,
    description:
      'PUBLISHED and historical SOLD; every other status returns LISTING_NOT_FOUND.',
  })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.queries.publicDetail(id);
  }
  @Post()
  @UseGuards(AuthenticationGuard, RequestRateGuard)
  @RequestRate('listingCreate')
  @ApiBearerAuth()
  @ApiCreatedResponse({
    type: OwnerListingResponse,
    example: OWNER_LISTING_EXAMPLE,
    headers: { ETag: { schema: { type: 'string', example: '"1"' } } },
  })
  @ApiResponse({ status: 401, type: ApiErrorResponse })
  @ApiResponse({ status: 403, type: ApiErrorResponse })
  @ApiBody({
    type: CreateListingInput,
    examples: {
      draft: {
        value: {
          vehicle: {
            modelId: '20000000-0000-4000-8000-000000000001',
            year: 2022,
            mileageKm: 30000,
            bodyType: 'SEDAN',
            fuelType: 'PETROL',
            transmission: 'AUTOMATIC',
            driveType: 'RWD',
            condition: 'USED',
          },
          listing: {
            title: 'BMW 3 Series 2022',
            description: 'Regularly serviced.',
            price: { amountMinor: '2500000', currency: 'EUR' },
          },
        },
      },
    },
  })
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateListingInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const listing = await this.commands.create(principal.userId, input);
    response.setHeader('Location', `/api/v1/me/listings/${listing.id}`);
    return ownerResponse(response, listing);
  }
}

@Controller({ path: 'me/listings', version: '1' })
@ApiExtraModels(
  SellerListQuery,
  OwnerListingResponse,
  OwnerPartListingResponse,
  OwnerListingSummary,
  OwnerPartListingSummary,
)
@ApiTags('Listings / Marketplace')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, RequestRateGuard)
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 403, type: ApiErrorResponse })
@ApiResponse({ status: 404, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
@ApiResponse({ status: 503, type: ApiErrorResponse })
export class SellerListingsController {
  constructor(
    @Inject(ListingQueries) private readonly queries: ListingQueries,
    @Inject(ListingCommands) private readonly commands: ListingCommands,
  ) {}
  @Get()
  @RequestRate('listingSeller')
  @ApiOkResponse({ type: OwnerListingPage })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: SellerListQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.queries.ownList(principal.userId, query);
  }
  @Get(':id')
  @RequestRate('listingSeller')
  @ApiOkResponse({
    schema: marketplaceOwnerSchema,
    example: OWNER_LISTING_EXAMPLE,
    headers: { ETag: { schema: { type: 'string', example: '"1"' } } },
  })
  async detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return ownerResponse(
      response,
      await this.queries.owner(id, principal.userId),
    );
  }
  @Patch(':id')
  @RequestRate('listingWrite')
  @MutationContract()
  @ApiBody({
    type: UpdateListingInput,
    examples: {
      price: {
        value: {
          listing: { price: { amountMinor: '2600000', currency: 'EUR' } },
        },
      },
    },
  })
  async update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: UpdateListingInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    return ownerResponse(
      response,
      await this.commands.update(
        id,
        principal.userId,
        expectedListingVersion(version),
        input,
      ),
    );
  }
  @Post(':id/submit')
  @HttpCode(200)
  @RequestRate('listingWrite')
  @MutationContract('submit')
  @ApiBody({
    schema: { type: 'object', additionalProperties: false, example: {} },
  })
  async submit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body(EmptyBodyPipe) _body: undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return ownerResponse(
      response,
      await this.commands.transition(
        id,
        principal.userId,
        expectedListingVersion(version),
        'submit',
      ),
    );
  }
  @Post(':id/archive')
  @HttpCode(200)
  @RequestRate('listingWrite')
  @MutationContract('archive')
  @ApiBody({
    schema: { type: 'object', additionalProperties: false, example: {} },
  })
  async archive(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body(EmptyBodyPipe) _body: undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return ownerResponse(
      response,
      await this.commands.transition(
        id,
        principal.userId,
        expectedListingVersion(version),
        'archive',
      ),
    );
  }
  @Post(':id/mark-sold')
  @HttpCode(200)
  @RequestRate('listingWrite')
  @MutationContract('mark-sold')
  @ApiBody({
    schema: { type: 'object', additionalProperties: false, example: {} },
  })
  async sold(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') version: string | undefined,
    @Body(EmptyBodyPipe) _body: undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return ownerResponse(
      response,
      await this.commands.transition(
        id,
        principal.userId,
        expectedListingVersion(version),
        'mark-sold',
      ),
    );
  }
}
