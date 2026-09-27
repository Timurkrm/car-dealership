import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../../../platform/http/api-error';
import { EmptyBodyPipe } from '../../../platform/http/empty-body.pipe';
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import {
  AuthenticationGuard,
  CurrentPrincipal,
  type AuthenticatedPrincipal,
} from '../../auth';
import { NotificationCenter } from '../application/notification-center';
import {
  NotificationListQuery,
  NotificationListResponse,
  NotificationUnreadResponse,
} from './notifications.dto';

@Controller({ path: 'me/notifications', version: '1' })
@ApiTags('Notifications')
@ApiExtraModels(NotificationListQuery)
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, RequestRateGuard)
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
export class NotificationsController {
  constructor(
    @Inject(NotificationCenter)
    private readonly notifications: NotificationCenter,
  ) {}

  @Get()
  @RequestRate('engagementRead')
  @ApiOkResponse({
    description: 'Private discriminated notification timeline.',
    type: NotificationListResponse,
  })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: NotificationListQuery,
  ) {
    return this.notifications.list(principal, query);
  }

  @Get('unread-count')
  @RequestRate('engagementRead')
  @ApiOkResponse({
    description: 'Unread count backed by the partial index.',
    type: NotificationUnreadResponse,
  })
  unread(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.notifications.unreadCount(principal);
  }

  @Post('read-all')
  @HttpCode(200)
  @RequestRate('notificationWrite')
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  markAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body(EmptyBodyPipe) _body: undefined,
  ) {
    void _body;
    return this.notifications.markAllRead(principal);
  }

  @Post(':id/read')
  @HttpCode(200)
  @RequestRate('notificationWrite')
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  markRead(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(EmptyBodyPipe) _body: undefined,
  ) {
    void _body;
    return this.notifications.markRead(principal, id);
  }
}
