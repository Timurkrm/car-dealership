import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { SavedSearches } from '../application/saved-searches';
import {
  CreateSavedSearchInput,
  SavedSearchListResponse,
  SavedSearchResponse,
  UpdateSavedSearchInput,
} from './saved-search.dto';

@Controller({ path: 'me/saved-searches', version: '1' })
@ApiTags('Saved Searches')
@ApiExtraModels(CreateSavedSearchInput, UpdateSavedSearchInput)
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, RequestRateGuard)
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
export class SavedSearchController {
  constructor(
    @Inject(SavedSearches) private readonly savedSearches: SavedSearches,
  ) {}

  @Post()
  @RequestRate('savedSearchCreate')
  @ApiCreatedResponse({
    description: 'Canonical Search-v2 subscription.',
    type: SavedSearchResponse,
  })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: CreateSavedSearchInput,
  ) {
    return this.savedSearches.create(principal, input);
  }

  @Get()
  @RequestRate('engagementRead')
  @ApiOkResponse({
    description: 'Private bounded saved-search list.',
    type: SavedSearchListResponse,
  })
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.savedSearches.list(principal);
  }

  @Patch(':id')
  @RequestRate('engagementWrite')
  @ApiOkResponse({
    description: 'Update name or notification state.',
    type: SavedSearchResponse,
  })
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSavedSearchInput,
  ) {
    return this.savedSearches.update(principal, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequestRate('engagementWrite')
  @ApiNoContentResponse({ description: 'Idempotent owner-scoped removal.' })
  async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.savedSearches.remove(principal, id);
  }
}
