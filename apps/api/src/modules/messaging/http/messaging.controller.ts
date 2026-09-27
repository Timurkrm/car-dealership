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
import {
  RequestRate,
  RequestRateGuard,
} from '../../../platform/http/request-rate.guard';
import { AuthenticationGuard, CurrentPrincipal } from '../../auth';
import type { AuthenticatedPrincipal } from '../../auth';
import { ConversationCommands } from '../application/conversation-commands';
import { ConversationQueries } from '../application/conversation-queries';
import { MessageCommands } from '../application/message-commands';
import {
  ConversationDetailResponseDto,
  ConversationListResponseDto,
  ConversationOpenedDto,
  ConversationPageQuery,
  ConversationReadResponseDto,
  MarkConversationReadDto,
  MessageListResponseDto,
  MessagePageQuery,
  MessageResponseDto,
  MessagingUnreadCountDto,
  OpenConversationDto,
  SendMessageDto,
} from './messaging.dto';

@Controller({ path: '', version: '1' })
@ApiTags('Messaging')
@ApiBearerAuth()
@ApiExtraModels(ConversationPageQuery, MessagePageQuery)
@UseGuards(AuthenticationGuard, RequestRateGuard)
@ApiResponse({ status: 401, type: ApiErrorResponse })
@ApiResponse({ status: 400, type: ApiErrorResponse })
@ApiResponse({ status: 404, type: ApiErrorResponse })
@ApiResponse({ status: 409, type: ApiErrorResponse })
@ApiResponse({ status: 429, type: ApiErrorResponse })
export class MessagingController {
  constructor(
    @Inject(ConversationCommands)
    private readonly conversations: ConversationCommands,
    @Inject(ConversationQueries) private readonly queries: ConversationQueries,
    @Inject(MessageCommands) private readonly messages: MessageCommands,
  ) {}

  @Post('conversations')
  @HttpCode(200)
  @RequestRate('conversationCreate')
  @ApiBody({ type: OpenConversationDto })
  @ApiOkResponse({
    description: 'Opens or returns the buyer/listing conversation.',
    type: ConversationOpenedDto,
  })
  open(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: OpenConversationDto,
  ) {
    return this.conversations.open(principal, body.listingId);
  }

  @Get('me/conversations')
  @RequestRate('messagingRead')
  @ApiOkResponse({
    description: 'Owner-scoped conversation inbox with unread counts.',
    type: ConversationListResponseDto,
  })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ConversationPageQuery,
  ) {
    return this.queries.list(principal, query);
  }

  @Get('me/conversations/unread-count')
  @RequestRate('messagingRead')
  @ApiOkResponse({
    description: 'Global unread message count.',
    type: MessagingUnreadCountDto,
  })
  unread(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.queries.unreadCount(principal);
  }

  @Get('me/conversations/:id')
  @RequestRate('messagingRead')
  @ApiOkResponse({
    description: 'Owner-scoped conversation detail.',
    type: ConversationDetailResponseDto,
  })
  detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.queries.detail(principal, id);
  }

  @Get('me/conversations/:id/messages')
  @RequestRate('messagingRead')
  @ApiOkResponse({
    description: 'Chronological page with an opaque cursor for older messages.',
    type: MessageListResponseDto,
  })
  history(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessagePageQuery,
  ) {
    return this.queries.messages(principal, id, query);
  }

  @Post('me/conversations/:id/messages')
  @HttpCode(200)
  @RequestRate('messageSend')
  @ApiBody({ type: SendMessageDto })
  @ApiOkResponse({
    description:
      'Durably sends a plain-text message; retries use clientMessageId.',
    type: MessageResponseDto,
  })
  send(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.messages.send(principal, id, body);
  }

  @Post('me/conversations/:id/read')
  @HttpCode(200)
  @RequestRate('messageRead')
  @ApiBody({ type: MarkConversationReadDto })
  @ApiOkResponse({
    description: 'Monotonically advances the participant read watermark.',
    type: ConversationReadResponseDto,
  })
  read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarkConversationReadDto,
  ) {
    return this.queries.markRead(principal, id, body.messageId);
  }
}
