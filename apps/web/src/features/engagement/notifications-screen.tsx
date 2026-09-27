'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { EngagementClient } from './engagement-client';
import type { NotificationItem } from './engagement-client';
import { useRealtime } from '../realtime/realtime-provider';

const labels: Record<string, string> = {
  MODERATION_RESULT: 'Результат модерации',
  ACCOUNT_STATUS_CHANGED: 'Статус аккаунта изменён',
  SAVED_SEARCH_MATCH: 'Новое объявление по сохранённому поиску',
  FAVORITE_LISTING_STATUS_CHANGED: 'Статус избранного объявления изменён',
  NEW_MESSAGE: 'Новое сообщение',
  LISTING_STATUS_CHANGED: 'Статус объявления изменён',
  PRICE_CHANGED: 'Цена изменена',
};
export function NotificationsScreen() {
  const { client } = useAuth(),
    api = useMemo(() => new EngagementClient(client), [client]);
  const realtime = useRealtime();
  const [items, setItems] = useState<NotificationItem[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [unreadOnly, setUnreadOnly] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const load = useCallback(
    async (next?: string, append = false, signal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      try {
        const result = await api.notifications(next, unreadOnly, signal);
        setItems((rows) =>
          append ? [...rows, ...result.items] : result.items,
        );
        setCursor(result.page.nextCursor);
      } catch {
        if (!signal?.aborted) setError(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api, unreadOnly],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void load(undefined, false, controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    const releases = [
      'notification:created',
      'notification:read',
      'notifications:read-all',
      'realtime:connected',
    ].map((event) => realtime.on(event, refresh));
    window.addEventListener('focus', refresh);
    return () => {
      releases.forEach((release) => release());
      window.removeEventListener('focus', refresh);
    };
  }, [load, realtime]);
  return (
    <>
      <div className="workspace-filters">
        <label>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />{' '}
          Только непрочитанные
        </label>
        <button
          onClick={() =>
            void api.markAllRead().then(() =>
              setItems((rows) =>
                rows.map((row) => ({
                  ...row,
                  readAt: row.readAt ?? new Date().toISOString(),
                })),
              ),
            )
          }
        >
          Отметить все прочитанными
        </button>
      </div>
      {loading && !items.length ? (
        <p role="status">Загружаем уведомления…</p>
      ) : null}
      {error ? (
        <p role="alert">
          Не удалось загрузить уведомления.{' '}
          <button onClick={() => void load()}>Повторить</button>
        </p>
      ) : null}
      {!loading && !error && !items.length ? <p>Уведомлений нет.</p> : null}
      <ul className="notification-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={item.readAt ? '' : 'notification-unread'}
          >
            <h2>{labels[item.type] ?? 'Уведомление'}</h2>
            <p>{notificationText(item)}</p>
            <p>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString('ru-RU')}
              </time>
            </p>
            {item.target ? (
              <Link
                href={
                  item.target.kind === 'CONVERSATION'
                    ? `/account/messages/${item.target.id}`
                    : `${item.content.listingType === 'PART' ? '/parts' : '/listings'}/${item.target.id}`
                }
                onClick={() => {
                  if (!item.readAt) {
                    setItems((rows) =>
                      rows.map((row) =>
                        row.id === item.id
                          ? { ...row, readAt: new Date().toISOString() }
                          : row,
                      ),
                    );
                    void api.markRead(item.id).catch(() => void load());
                  }
                }}
              >
                {item.target.kind === 'CONVERSATION'
                  ? 'Открыть диалог'
                  : 'Открыть объявление'}
              </Link>
            ) : null}
            {!item.readAt ? (
              <button
                onClick={() =>
                  void api
                    .markRead(item.id)
                    .then(() =>
                      setItems((rows) =>
                        rows.map((row) =>
                          row.id === item.id
                            ? { ...row, readAt: new Date().toISOString() }
                            : row,
                        ),
                      ),
                    )
                }
              >
                Отметить прочитанным
              </button>
            ) : null}
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
function notificationText(item: NotificationItem): string {
  if (item.type === 'FAVORITE_LISTING_STATUS_CHANGED')
    return item.content.status === 'SOLD'
      ? 'Избранное объявление продано.'
      : 'Избранное объявление больше недоступно.';
  if (item.type === 'SAVED_SEARCH_MATCH')
    return 'Появилось новое подходящее объявление.';
  if (item.type === 'MODERATION_RESULT')
    return typeof item.content.message === 'string'
      ? item.content.message
      : `Новый статус: ${String(item.content.status ?? '')}`;
  if (item.type === 'ACCOUNT_STATUS_CHANGED')
    return `Новый статус аккаунта: ${String(item.content.accountStatus ?? '')}`;
  return 'Откройте связанный раздел, чтобы узнать подробности.';
}
