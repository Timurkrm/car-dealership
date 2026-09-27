import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import { requestContext } from '../../../platform/http/request-context';
import { AccountAuthService } from '../application/account-auth.service';
import { PasswordAuthService } from '../application/password-auth.service';
import { SecurityActionsService } from '../application/security-actions.service';
import { SessionService } from '../application/session.service';
import type { SessionGrant } from '../application/session.service';
import type {
  AuthenticatedPrincipal,
  RequestSecurityContext,
} from '../domain/auth.types';
import {
  AuthenticationGuard,
  AuthOriginGuard,
  CurrentPrincipal,
} from './auth.guards';
import { AuthRate, AuthRateGuard } from './auth-rate.guard';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';
import {
  AccessResponse,
  ChangePasswordInput,
  CurrentUserResponse,
  EmailInput,
  LoginInput,
  MessageResponse,
  RegisterInput,
  ResetPasswordInput,
  TokenInput,
} from './auth.dto';
import { EmptyBodyPipe } from './empty-body.pipe';
import { ApiException } from '../../../platform/http/api-error';
import { EmailChangeService } from '../application/email-change.service';

const securityContext = (): RequestSecurityContext => ({
  requestId: requestContext.getStore()?.requestId ?? null,
});
@ApiTags('auth')
@ApiHeader({
  name: 'Origin',
  required: false,
  description: 'Required on every POST; must equal configured WEB_URL.',
})
@ApiResponse({
  status: 400,
  type: ApiErrorResponse,
  description:
    'VALIDATION_ERROR, PASSWORD_POLICY_VIOLATION or invalid/expired action token',
})
@ApiResponse({
  status: 401,
  type: ApiErrorResponse,
  description:
    'INVALID_CREDENTIALS, AUTHENTICATION_REQUIRED, invalid/reused refresh or expired/revoked session',
})
@ApiResponse({
  status: 403,
  type: ApiErrorResponse,
  description:
    'ORIGIN_NOT_ALLOWED, EMAIL_VERIFICATION_REQUIRED, ACCOUNT_BLOCKED or ACCOUNT_SUSPENDED',
})
@ApiResponse({
  status: 429,
  type: ApiErrorResponse,
  description: 'AUTH_RATE_LIMITED; Retry-After header contains seconds',
})
@ApiResponse({
  status: 503,
  type: ApiErrorResponse,
  description: 'AUTH_RATE_LIMIT_UNAVAILABLE or AUTH_BUSY',
})
@UseGuards(AuthOriginGuard, AuthRateGuard)
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AccountAuthService) private readonly accounts: AccountAuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SecurityActionsService)
    private readonly actions: SecurityActionsService,
    @Inject(PasswordAuthService)
    private readonly passwords: PasswordAuthService,
    @Inject(EmailChangeService)
    private readonly emailChange: EmailChangeService,
  ) {}
  private grant(response: Response, grant: SessionGrant): AccessResponse {
    setRefreshCookie(
      response,
      this.config.auth,
      grant.refreshSecret,
      grant.refreshExpiresAt,
    );
    return { accessToken: grant.accessToken, expiresIn: grant.expiresIn };
  }
  @Post('register')
  @AuthRate('register')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Create pending account and request email verification; no session issued',
  })
  @ApiResponse({ status: 201, type: MessageResponse })
  @ApiResponse({
    status: 409,
    type: ApiErrorResponse,
    description: 'EMAIL_ALREADY_REGISTERED',
  })
  @ApiBody({ type: RegisterInput })
  async register(@Body() body: RegisterInput): Promise<MessageResponse> {
    await this.accounts.register(body, securityContext());
    return {
      message: 'Account created. Confirm your email before signing in.',
    };
  }
  @Post('login')
  @HttpCode(200)
  @AuthRate('login')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Create browser session; refresh credential is returned only in HttpOnly cookie',
  })
  @ApiResponse({ status: 200, type: AccessResponse })
  @ApiBody({ type: LoginInput })
  async login(
    @Body() body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessResponse> {
    return this.grant(
      response,
      await this.accounts.login(body, securityContext()),
    );
  }
  @Post('refresh')
  @HttpCode(200)
  @AuthRate('refresh')
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth()
  @ApiOperation({
    summary:
      'Consume refresh cookie and rotate within the same absolute-lifetime session',
  })
  @ApiResponse({ status: 200, type: AccessResponse })
  async refresh(
    @Body(EmptyBodyPipe) _body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessResponse> {
    if (Object.keys(request.query).length)
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Query parameters are not accepted',
      );
    try {
      return this.grant(
        response,
        await this.sessions.refresh(
          readRefreshCookie(request),
          securityContext(),
        ),
      );
    } catch (error) {
      if (
        error instanceof ApiException &&
        (error.getStatus() === 401 || error.getStatus() === 403)
      )
        clearRefreshCookie(response, this.config.auth);
      throw error;
    }
  }
  @Post('logout')
  @HttpCode(204)
  @AuthRate('logout')
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Idempotently revoke current cookie session and clear cookie',
  })
  @ApiResponse({ status: 204 })
  async logout(
    @Body(EmptyBodyPipe) _body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logout(readRefreshCookie(req), securityContext());
    clearRefreshCookie(response, this.config.auth);
  }
  @Post('logout-all')
  @HttpCode(204)
  @AuthRate('logout')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthenticationGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session including current session' })
  @ApiResponse({ status: 204 })
  async logoutAll(
    @Body(EmptyBodyPipe) _body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logoutAll(principal, securityContext());
    clearRefreshCookie(response, this.config.auth);
  }
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthenticationGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Return allowlisted current identity; account, session and roles checked in PostgreSQL',
  })
  @ApiResponse({ status: 200, type: CurrentUserResponse })
  me(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CurrentUserResponse> {
    return this.accounts.me(principal);
  }
  @Post('email-verification/request')
  @HttpCode(202)
  @AuthRate('verification')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Request new verification link; identical response for known and unknown accounts',
  })
  @ApiResponse({ status: 202, type: MessageResponse })
  @ApiBody({ type: EmailInput })
  async requestVerification(
    @Body() body: EmailInput,
  ): Promise<MessageResponse> {
    await this.actions.request(
      body.email,
      'EMAIL_VERIFICATION',
      securityContext(),
    );
    return {
      message:
        'If an eligible account exists, verification instructions will be sent.',
    };
  }
  @Post('email-verification/confirm')
  @HttpCode(204)
  @AuthRate('confirm')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Consume purpose-specific verification token and activate pending account',
  })
  @ApiResponse({ status: 204 })
  @ApiBody({ type: TokenInput })
  async confirmVerification(@Body() body: TokenInput): Promise<void> {
    await this.actions.confirmEmail(body.token, securityContext());
  }
  @Post('email-change/confirm')
  @HttpCode(204)
  @AuthRate('confirm')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Consume a single-use email-change token and revoke other sessions',
  })
  @ApiResponse({ status: 204 })
  @ApiBody({ type: TokenInput })
  async confirmEmailChange(@Body() body: TokenInput): Promise<void> {
    await this.emailChange.confirm(body.token, securityContext());
  }
  @Post('password/forgot')
  @HttpCode(202)
  @AuthRate('forgot')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Request single-use recovery link; identical response for known and unknown accounts',
  })
  @ApiResponse({ status: 202, type: MessageResponse })
  @ApiBody({ type: EmailInput })
  async forgot(@Body() body: EmailInput): Promise<MessageResponse> {
    await this.actions.request(body.email, 'PASSWORD_RESET', securityContext());
    return {
      message:
        'If an eligible account exists, password recovery instructions will be sent.',
    };
  }
  @Post('password/reset')
  @HttpCode(204)
  @AuthRate('reset')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Consume recovery token, replace password and revoke every session atomically',
  })
  @ApiResponse({ status: 204 })
  @ApiBody({ type: ResetPasswordInput })
  async reset(@Body() body: ResetPasswordInput): Promise<void> {
    await this.passwords.reset(body.token, body.newPassword, securityContext());
  }
  @Post('password/change')
  @HttpCode(204)
  @AuthRate('change')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthenticationGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Verify current password, replace hash, revoke other sessions and outstanding recovery links',
  })
  @ApiResponse({ status: 204 })
  @ApiBody({ type: ChangePasswordInput })
  async change(
    @Body() body: ChangePasswordInput,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<void> {
    await this.passwords.change(
      principal,
      body.currentPassword,
      body.newPassword,
      securityContext(),
    );
  }
}
