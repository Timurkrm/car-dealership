import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import {
  AuthenticationGuard,
  CurrentPrincipal,
  type AuthenticatedPrincipal,
} from '../../auth';
import { FavoritesService } from '../application/favorites.service';
import {
  FavoriteListQuery,
  FavoriteListResponse,
  FavoriteMutationResponse,
} from './favorites.dto';

@Controller({ path: 'me/favorites', version: '1' })
@ApiTags('Favorites')
@ApiExtraModels(FavoriteListQuery)
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, RequestRateGuard)
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
export class FavoritesController {
  constructor(
    @Inject(FavoritesService) private readonly favorites: FavoritesService,
  ) {}

  @Put(':listingId')
  @HttpCode(200)
  @RequestRate('engagementWrite')
  @ApiOkResponse({
    description: 'Idempotently favorites a PUBLISHED listing.',
    type: FavoriteMutationResponse,
  })
  add(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.favorites.add(principal, listingId);
  }

  @Delete(':listingId')
  @HttpCode(204)
  @RequestRate('engagementWrite')
  @ApiNoContentResponse({ description: 'Idempotent favorite removal.' })
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ): Promise<void> {
    await this.favorites.remove(principal, listingId);
  }

  @Get()
  @RequestRate('engagementRead')
  @ApiOkResponse({
    description:
      'Private mixed Cars/Parts cursor page; hidden listings are safe tombstones.',
    type: FavoriteListResponse,
  })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: FavoriteListQuery,
  ) {
    return this.favorites.list(principal, query);
  }
}
