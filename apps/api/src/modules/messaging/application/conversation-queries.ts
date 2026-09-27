import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseConnection } from '../../../platform/database/database.connection';
import { OpaqueCursor } from '../../../platform/http/opaque-cursor';
import { ApiException } from '../../../platform/http/api-error';
import { RealtimePublisher } from '../../../platform/realtime/realtime-publisher';
import { REALTIME_EVENTS } from '../../../platform/realtime/realtime-events';
import type { AuthenticatedPrincipal } from '../../auth';
import { ListingMessagingReader } from '../../listings';
import type { FavoriteListingCard } from '../../listings';
import { UserIdentity } from '../../users';
import { Conversation } from '../infrastructure/persistence/conversation.entity';
import { ConversationParticipant } from '../infrastructure/persistence/conversation-participant.entity';
import { Message } from '../infrastructure/persistence/message.entity';
import { conversationNotFound } from './messaging-errors';
import { messageView } from './message-view';
import type {
  ConversationPageQuery,
  MessagePageQuery,
} from '../http/messaging.dto';

interface InboxRow {
  id: string;
  listing_id: string;
  buyer_id: string;
  created_at: Date;
  activity_at: Date;
  other_user_id: string;
  last_message_id: string | null;
  last_message_sender_id: string | null;
  last_message_body: string | null;
  last_message_deleted_at: Date | null;
  last_message_created_at: Date | null;
  unread_count: string;
  send_disabled_at: Date | null;
}

@Injectable()
export class ConversationQueries {
  constructor(
    @Inject(DatabaseConnection) private readonly database: DatabaseConnection,
    @Inject(OpaqueCursor) private readonly cursors: OpaqueCursor,
    @Inject(ListingMessagingReader)
    private readonly listings: ListingMessagingReader,
    @Inject(UserIdentity) private readonly users: UserIdentity,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async list(principal: AuthenticatedPrincipal, query: ConversationPageQuery) {
    const fingerprint = hash({ userId: principal.userId });
    const position = this.cursor(
      query.cursor,
      'conversation-inbox',
      fingerprint,
    );
    const values: unknown[] = [principal.userId, query.limit + 1];
    let after = '';
    if (position) {
      values.push(position.at, position.id);
      after = `AND (COALESCE(c.last_message_at, c.created_at), c.id) < ($3::timestamptz, $4::uuid)`;
    }
    const rows = await this.database.source.query<InboxRow[]>(
      `SELECT c.id, c.listing_id, c.buyer_id, c.created_at, c.send_disabled_at,
              COALESCE(c.last_message_at, c.created_at) AS activity_at,
              other.user_id AS other_user_id,
              latest.id AS last_message_id, latest.sender_id AS last_message_sender_id,
              latest.body AS last_message_body, latest.deleted_at AS last_message_deleted_at,
              latest.created_at AS last_message_created_at,
              (SELECT count(*)::text FROM messages unread
               WHERE unread.conversation_id = c.id AND unread.sender_id <> $1
                 AND (self.last_read_message_id IS NULL OR
                      (unread.created_at, unread.id) >
                      (read_message.created_at, read_message.id))) AS unread_count
       FROM conversation_participants self
       JOIN conversations c ON c.id = self.conversation_id
       LEFT JOIN messages read_message
         ON read_message.id = self.last_read_message_id
        AND read_message.conversation_id = self.conversation_id
       JOIN LATERAL (
         SELECT participant.user_id FROM conversation_participants participant
         WHERE participant.conversation_id = c.id AND participant.user_id <> $1
         ORDER BY participant.joined_at, participant.user_id LIMIT 1
       ) other ON true
       LEFT JOIN LATERAL (
         SELECT message.id, message.sender_id, message.body, message.deleted_at, message.created_at
         FROM messages message WHERE message.conversation_id = c.id
         ORDER BY message.created_at DESC, message.id DESC LIMIT 1
       ) latest ON true
       WHERE self.user_id = $1 ${after}
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
       LIMIT $2`,
      values,
    );
    const page = rows.slice(0, query.limit);
    const [cards, people] = await Promise.all([
      this.listings.cards([...new Set(page.map((row) => row.listing_id))]),
      this.users.publicSummaries(
        [...new Set(page.map((row) => row.other_user_id))],
        this.database.source.manager,
      ),
    ]);
    const names = new Map(
      people.map((person) => [person.id, person.displayName]),
    );
    const items = page.map((row) =>
      this.summary(
        row,
        cards.get(row.listing_id),
        names.get(row.other_user_id),
      ),
    );
    const last = page.at(-1);
    return {
      items,
      page: {
        hasNextPage: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode('conversation-inbox', fingerprint, {
                at: new Date(last.activity_at).toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  async detail(principal: AuthenticatedPrincipal, conversationId: string) {
    await this.assertParticipant(principal.userId, conversationId);
    const conversation = await this.database.source.manager.findOneBy(
      Conversation,
      { id: conversationId },
    );
    if (!conversation) throw conversationNotFound();
    const participants = await this.database.source.manager.findBy(
      ConversationParticipant,
      { conversationId },
    );
    const people = await this.users.publicSummaries(
      participants.map((row) => row.userId),
      this.database.source.manager,
    );
    const card = (await this.listings.cards([conversation.listingId])).get(
      conversation.listingId,
    );
    return {
      id: conversation.id,
      listing: listingView(conversation.listingId, card),
      participants: people.map((person) => ({
        id: person.id,
        displayName: person.displayName,
      })),
      buyerId: conversation.buyerId,
      createdAt: conversation.createdAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      canSend: !conversation.sendDisabledAt,
    };
  }

  async messages(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    query: MessagePageQuery,
  ) {
    await this.assertParticipant(principal.userId, conversationId);
    const fingerprint = hash({ conversationId });
    const position = this.cursor(
      query.cursor,
      'conversation-messages',
      fingerprint,
    );
    const builder = this.database.source
      .getRepository(Message)
      .createQueryBuilder('message')
      .addSelect('message.body')
      .where('message.conversationId = :conversationId', { conversationId });
    if (position)
      builder.andWhere(
        '(message.createdAt < :at OR (message.createdAt = :at AND message.id < :id))',
        { at: position.at, id: position.id },
      );
    const rows = await builder
      .orderBy('message.createdAt', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .limit(query.limit + 1)
      .getMany();
    const page = rows.slice(0, query.limit);
    const oldest = page.at(-1);
    return {
      items: page.reverse().map(messageView),
      page: {
        hasNextPage: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && oldest
            ? this.cursors.encode('conversation-messages', fingerprint, {
                at: oldest.createdAt.toISOString(),
                id: oldest.id,
              })
            : null,
      },
    };
  }

  async unreadCount(principal: AuthenticatedPrincipal) {
    const rows = await this.database.source.query<{ count: string }[]>(
      `SELECT count(*)::text AS count
       FROM messages message
       JOIN conversation_participants participant
         ON participant.conversation_id = message.conversation_id
        AND participant.user_id = $1
       LEFT JOIN messages read_message
         ON read_message.id = participant.last_read_message_id
        AND read_message.conversation_id = participant.conversation_id
       WHERE message.sender_id <> $1
         AND (participant.last_read_message_id IS NULL OR
              (message.created_at, message.id) >
              (read_message.created_at, read_message.id))`,
      [principal.userId],
    );
    return { count: Number(rows[0]?.count ?? 0) };
  }

  async markRead(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    messageId: string,
  ) {
    const committed = await this.database.source.transaction(
      async (manager) => {
        const participant = await manager.findOne(ConversationParticipant, {
          where: { conversationId, userId: principal.userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!participant) throw conversationNotFound();
        const target = await manager.findOneBy(Message, {
          id: messageId,
          conversationId,
        });
        if (!target) throw conversationNotFound();
        const current = participant.lastReadMessageId
          ? await manager.findOneBy(Message, {
              id: participant.lastReadMessageId,
              conversationId,
            })
          : null;
        const comparison = await manager.query<{ changed: boolean }[]>(
          `SELECT $1::uuid IS NULL OR
                (current_message.created_at, current_message.id) <
                (target_message.created_at, target_message.id) AS changed
         FROM messages target_message
         LEFT JOIN messages current_message ON current_message.id = $1::uuid
         WHERE target_message.id = $2::uuid
           AND target_message.conversation_id = $3::uuid`,
          [participant.lastReadMessageId, target.id, conversationId],
        );
        const changed = comparison[0]?.changed === true;
        if (changed)
          await manager.query(
            `UPDATE conversation_participants participant
           SET last_read_at = target.created_at,
               last_read_message_id = target.id
           FROM messages target
           WHERE participant.conversation_id = $1
             AND participant.user_id = $2
             AND target.id = $3
             AND target.conversation_id = $1`,
            [conversationId, principal.userId, target.id],
          );
        const participants = await manager.findBy(ConversationParticipant, {
          conversationId,
        });
        const actual = changed ? target : (current ?? target);
        return {
          messageId: actual.id,
          changed,
          readAt: actual.createdAt.toISOString(),
          participantIds: participants.map((row) => row.userId),
        };
      },
    );
    if (committed.changed)
      await this.realtime.users(
        committed.participantIds,
        REALTIME_EVENTS.conversationRead,
        {
          conversationId,
          userId: principal.userId,
          messageId: committed.messageId,
          readAt: committed.readAt,
        },
      );
    return {
      conversationId,
      messageId: committed.messageId,
      readAt: committed.readAt,
    };
  }

  async isParticipant(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.database.source.manager.findOneBy(ConversationParticipant, {
        userId,
        conversationId,
      }),
    );
  }

  private async assertParticipant(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    if (!(await this.isParticipant(userId, conversationId)))
      throw conversationNotFound();
  }

  private summary(
    row: InboxRow,
    card: FavoriteListingCard | undefined,
    displayName: string | undefined,
  ) {
    return {
      id: row.id,
      listing: listingView(row.listing_id, card),
      otherParticipant: {
        id: row.other_user_id,
        displayName: displayName ?? 'Пользователь',
      },
      lastMessage: row.last_message_id
        ? {
            id: row.last_message_id,
            senderId: row.last_message_sender_id,
            body: row.last_message_deleted_at ? null : row.last_message_body,
            deletedAt: row.last_message_deleted_at?.toISOString() ?? null,
            createdAt: row.last_message_created_at?.toISOString() ?? null,
          }
        : null,
      unreadCount: Number(row.unread_count),
      activityAt: new Date(row.activity_at).toISOString(),
      canSend: row.send_disabled_at === null,
    };
  }

  private cursor(
    value: string | undefined,
    scope: string,
    fingerprint: string,
  ) {
    try {
      const decoded = this.cursors.decode(value, scope, fingerprint);
      if (decoded === null) return null;
      if (
        !decoded ||
        typeof decoded !== 'object' ||
        !('at' in decoded) ||
        typeof decoded.at !== 'string' ||
        Number.isNaN(Date.parse(decoded.at)) ||
        !('id' in decoded) ||
        typeof decoded.id !== 'string' ||
        !UUID.test(decoded.id)
      )
        throw new Error('invalid');
      return decoded as { at: string; id: string };
    } catch (error) {
      if (
        error instanceof ApiException &&
        error.code === 'CURSOR_QUERY_MISMATCH'
      )
        throw new ApiException(
          400,
          'MESSAGING_CURSOR_QUERY_MISMATCH',
          error.safeMessage,
        );
      throw new ApiException(400, 'MESSAGING_INVALID_CURSOR', 'Invalid cursor');
    }
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('base64url');

function listingView(listingId: string, card: FavoriteListingCard | undefined) {
  if (!card)
    return {
      kind: 'UNAVAILABLE' as const,
      listingId,
      title: 'Объявление недоступно',
    };
  return card;
}
