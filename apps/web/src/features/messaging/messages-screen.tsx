'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { useRealtime } from '../realtime/realtime-provider';
import { MessagingClient } from './messaging-client';
import type { ConversationItem } from './messaging-client';

export function MessagesScreen() {
  const { client } = useAuth();
  const api = useMemo(() => new MessagingClient(client), [client]);
  const realtime = useRealtime();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(
    async (next?: string, append = false, signal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      try {
        const page = await api.conversations(next, signal);
        setItems((current) =>
          append ? mergeConversations(current, page.items) : page.items,
        );
        setCursor(page.page.nextCursor);
      } catch {
        if (!signal?.aborted) setError(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api],
  );
  useEffect(() => {
    const controller = new AbortController();
    const bootstrap = window.setTimeout(
      () => void load(undefined, false, controller.signal),
      0,
    );
    const reconcile = () => void load();
    const offCreated = realtime.on('message:created', reconcile);
    const offUpdated = realtime.on('conversation:updated', reconcile);
    const offRead = realtime.on('conversation:read', reconcile);
    const offConnected = realtime.on('realtime:connected', reconcile);
    const focus = () => void load();
    window.addEventListener('focus', focus);
    return () => {
      window.clearTimeout(bootstrap);
      controller.abort();
      offCreated();
      offUpdated();
      offRead();
      offConnected();
      window.removeEventListener('focus', focus);
    };
  }, [load, realtime]);
  if (loading && !items.length) return <p role="status">Загружаем диалоги…</p>;
  return (
    <>
      {error ? (
        <p role="alert">
          Не удалось загрузить диалоги.{' '}
          <button onClick={() => void load()}>Повторить</button>
        </p>
      ) : null}
      {!error && !items.length ? <p>Диалогов пока нет.</p> : null}
      <ul className="conversation-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link prefetch={false} href={`/account/messages/${item.id}`}>
              <strong>{listingTitle(item.listing)}</strong>
              <span>{item.otherParticipant.displayName}</span>
              <span>
                {item.lastMessage?.body ??
                  (item.lastMessage ? 'Сообщение удалено' : 'Начните разговор')}
              </span>
              {item.unreadCount ? (
                <b aria-label={`Непрочитанных: ${item.unreadCount}`}>
                  {item.unreadCount}
                </b>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {cursor ? (
        <button disabled={loading} onClick={() => void load(cursor, true)}>
          Показать ещё
        </button>
      ) : null}
    </>
  );
}

function mergeConversations(
  current: ConversationItem[],
  incoming: ConversationItem[],
) {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) =>
    b.activityAt.localeCompare(a.activityAt),
  );
}
function listingTitle(listing: Record<string, unknown>): string {
  return typeof listing.title === 'string'
    ? listing.title
    : 'Объявление недоступно';
}
