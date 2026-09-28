import { Inject, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { APP_CONFIG } from '../../../config/config';
import type { AppConfig } from '../../../config/config';
import { ApiException } from '../../../platform/http/api-error';
import { RequestRateGuard } from '../../../platform/http/request-rate.guard';
import { MetricsRegistry } from '../../../platform/observability/metrics.registry';
import {
  conversationRoom,
  userRoom,
} from '../../../platform/realtime/realtime-events';
import { SessionService } from '../../auth';
import type { AuthenticatedPrincipal } from '../../auth';
import { ConversationQueries } from '../application/conversation-queries';
import { MessageCommands } from '../application/message-commands';
// Runtime DTO imports are required for Nest ValidationPipe design metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MarkConversationReadDto, SendMessageDto } from '../http/messaging.dto';

interface AuthenticatedSocketData {
  principal: AuthenticatedPrincipal;
  accessToken: string;
  expiresAt: number;
  expiryTimer?: NodeJS.Timeout;
  revalidationTimer?: NodeJS.Timeout;
}

type MessagingSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  AuthenticatedSocketData
>;

@WebSocketGateway({
  namespace: '/realtime',
  transports: ['websocket'],
  cors: false,
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() private server!: Server;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ConversationQueries)
    private readonly conversations: ConversationQueries,
    @Inject(MessageCommands) private readonly messages: MessageCommands,
    @Inject(RequestRateGuard) private readonly rates: RequestRateGuard,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
  ) {}

  afterInit(server: Server): void {
    server.use(async (socket, next) => {
      try {
        if (socket.handshake.headers.origin !== this.config.webUrl)
          throw new ApiException(
            403,
            'REALTIME_ORIGIN_REJECTED',
            'Origin is not allowed',
          );
        if (
          'accessToken' in socket.handshake.query ||
          'token' in socket.handshake.query
        )
          throw new ApiException(
            401,
            'REALTIME_QUERY_TOKEN_FORBIDDEN',
            'Authentication required',
          );
        const token = socket.handshake.auth?.accessToken;
        if (typeof token !== 'string')
          throw new ApiException(
            401,
            'AUTHENTICATION_REQUIRED',
            'Authentication required',
          );
        const authenticated = await this.sessions.authenticateRealtime(token);
        socket.data = {
          principal: authenticated.principal,
          accessToken: token,
          expiresAt: authenticated.expiresAt.getTime(),
        };
        next();
      } catch (error) {
        next(
          new Error(
            error instanceof ApiException
              ? error.code
              : 'AUTHENTICATION_REQUIRED',
          ),
        );
      }
    });
  }

  handleConnection(client: MessagingSocket): void {
    this.metrics.websocketConnected();
    void client.join(userRoom(client.data.principal.userId));
    void client.join(`session:${client.data.principal.sessionId}`);
    const delay = Math.max(0, client.data.expiresAt - Date.now() + 5000);
    client.data.expiryTimer = setTimeout(() => client.disconnect(true), delay);
    client.data.revalidationTimer = setInterval(() => {
      void this.sessions
        .authenticate(client.data.accessToken)
        .catch(() => client.disconnect(true));
    }, this.config.messaging.socketRevalidateSeconds * 1000);
  }

  handleDisconnect(client: MessagingSocket): void {
    this.metrics.websocketDisconnected();
    clearTimeout(client.data.expiryTimer);
    clearInterval(client.data.revalidationTimer);
  }

  @SubscribeMessage('conversation:subscribe')
  async subscribe(
    @ConnectedSocket() client: MessagingSocket,
    @MessageBody() payload: { conversationId?: unknown },
  ) {
    return this.ack(async () => {
      const principal = await this.revalidate(client);
      await this.consume('messagingRead', principal.userId);
      const id = uuid(payload?.conversationId);
      if (!(await this.conversations.isParticipant(principal.userId, id)))
        throw new ApiException(
          404,
          'CONVERSATION_NOT_FOUND',
          'Conversation not found',
        );
      await client.join(conversationRoom(id));
      return { conversationId: id };
    });
  }

  @SubscribeMessage('conversation:unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: MessagingSocket,
    @MessageBody() payload: { conversationId?: unknown },
  ) {
    return this.ack(async () => {
      const principal = await this.revalidate(client);
      await this.consume('messagingRead', principal.userId);
      const id = uuid(payload?.conversationId);
      await client.leave(conversationRoom(id));
      return { conversationId: id };
    });
  }

  @SubscribeMessage('message:send')
  async send(
    @ConnectedSocket() client: MessagingSocket,
    @MessageBody() payload: SendMessageDto & { conversationId?: unknown },
  ) {
    return this.ack(async () => {
      const principal = await this.revalidate(client);
      const conversationId = uuid(payload.conversationId);
      await this.consume('messageSend', principal.userId);
      await this.consume(
        'messageSend',
        `${principal.userId}:${conversationId}`,
      );
      return this.messages.send(principal, conversationId, payload);
    });
  }

  @SubscribeMessage('conversation:read')
  async read(
    @ConnectedSocket() client: MessagingSocket,
    @MessageBody()
    payload: MarkConversationReadDto & { conversationId?: unknown },
  ) {
    return this.ack(async () => {
      const principal = await this.revalidate(client);
      await this.consume('messageRead', principal.userId);
      return this.conversations.markRead(
        principal,
        uuid(payload.conversationId),
        payload.messageId,
      );
    });
  }

  private async revalidate(
    client: MessagingSocket,
  ): Promise<AuthenticatedPrincipal> {
    if (Date.now() > client.data.expiresAt + 5000) {
      client.disconnect(true);
      throw new ApiException(
        401,
        'REALTIME_TOKEN_EXPIRED',
        'Authentication required',
      );
    }
    try {
      const principal = await this.sessions.authenticate(
        client.data.accessToken,
      );
      client.data.principal = principal;
      return principal;
    } catch (error) {
      client.disconnect(true);
      throw error;
    }
  }

  private async ack<T>(work: () => Promise<T>) {
    try {
      return { ok: true as const, data: await work() };
    } catch (error) {
      const safe = error instanceof ApiException ? error : null;
      return {
        ok: false as const,
        error: {
          code: safe?.code ?? 'REALTIME_COMMAND_FAILED',
          message: safe?.safeMessage ?? 'Command failed',
        },
      };
    }
  }

  private async consume(
    policy: 'messagingRead' | 'messageSend' | 'messageRead',
    identifier: string,
  ): Promise<void> {
    if ((await this.rates.consume(policy, identifier)) > 0)
      throw new ApiException(429, 'RATE_LIMITED', 'Too many requests');
  }
}

function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ApiException(
      400,
      'MESSAGING_INVALID_IDENTIFIER',
      'Invalid identifier',
    );
  return value;
}
