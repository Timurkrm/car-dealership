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
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import { EmptyBodyPipe } from '../../../platform/http/empty-body.pipe';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import { requestContext } from '../../../platform/http/request-context';
import {
  AccountSessionsService,
  AuthenticationGuard,
  AuthOriginGuard,
  CurrentPrincipal,
  EmailChangeService,
  clearRefreshCookie,
  type AuthenticatedPrincipal,
} from '../../auth';
import { NotificationPreferencesService } from '../../email-delivery';
import { AccountProfileService } from '../application/account-profile.service';
import {
  AccountProfileResponse,
  AccountSessionResponse,
  EmailChangeRequestInput,
  NotificationPreferencesInput,
  NotificationPreferencesResponse,
  UpdateProfileInput,
} from './account.dto';

const context = () => ({
  requestId: requestContext.getStore()?.requestId ?? null,
});

@ApiTags('account')
@ApiBearerAuth()
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 403, type: ApiErrorResponse })
@UseGuards(AuthOriginGuard, AuthenticationGuard, RequestRateGuard)
@Controller({ path: 'me', version: '1' })
export class AccountController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AccountProfileService)
    private readonly profiles: AccountProfileService,
    @Inject(EmailChangeService)
    private readonly emailChange: EmailChangeService,
    @Inject(AccountSessionsService)
    private readonly sessions: AccountSessionsService,
    @Inject(NotificationPreferencesService)
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Get('profile')
  @RequestRate('accountRead')
  @ApiOkResponse({ type: AccountProfileResponse })
  profile(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.profiles.get(principal);
  }
  @Patch('profile')
  @RequestRate('accountWrite')
  @ApiBody({ type: UpdateProfileInput })
  @ApiOkResponse({ type: AccountProfileResponse })
  updateProfile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: UpdateProfileInput,
  ) {
    return this.profiles.update(principal, body.displayName);
  }
  @Post('email-change/request')
  @HttpCode(202)
  @RequestRate('accountWrite')
  @ApiOperation({
    summary:
      'Verify current password and send a one-time link to the new email',
  })
  @ApiBody({ type: EmailChangeRequestInput })
  async requestEmailChange(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: EmailChangeRequestInput,
  ): Promise<{ message: string }> {
    await this.emailChange.request(
      principal,
      body.newEmail,
      body.currentPassword,
      context(),
    );
    return {
      message: 'Confirm the change using the link sent to the new email.',
    };
  }
  @Get('sessions')
  @RequestRate('accountRead')
  @ApiOkResponse({ type: [AccountSessionResponse] })
  listSessions(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.sessions.list(principal);
  }
  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @RequestRate('accountWrite')
  @ApiResponse({ status: 204 })
  async revokeSession(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.sessions.revoke(principal, sessionId, context());
    if (result.current) clearRefreshCookie(response, this.config.auth);
  }
  @Post('sessions/revoke-others')
  @HttpCode(200)
  @RequestRate('accountWrite')
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  async revokeOthers(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(EmptyBodyPipe) _body: undefined,
  ): Promise<{ revoked: number }> {
    void _body;
    return { revoked: await this.sessions.revokeOthers(principal, context()) };
  }
  @Get('notification-preferences')
  @RequestRate('accountRead')
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  getPreferences(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.preferences.get(principal.userId);
  }
  @Put('notification-preferences')
  @RequestRate('accountWrite')
  @ApiBody({ type: NotificationPreferencesInput })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  putPreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: NotificationPreferencesInput,
  ) {
    return this.preferences.update(principal.userId, body);
  }
}
