'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { MessagingClient } from '../messaging/messaging-client';
import { useRealtime } from '../realtime/realtime-provider';
import { EngagementClient } from './engagement-client';

export function EngagementNavigation() {
  const { client, status } = useAuth();
  const api = useMemo(() => new EngagementClient(client), [client]);
  const messaging = useMemo(() => new MessagingClient(client), [client]);
  const realtime = useRealtime();
  const [count, setCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const refresh = () => {
      void api
        .unreadCount()
        .then((value) => active && setCount(value))
        .catch(() => undefined);
      void messaging
        .unread()
        .then((value) => active && setMessageCount(value))
        .catch(() => undefined);
    };
    refresh();
    const releases = [
      'notification:created',
      'notification:read',
      'notifications:read-all',
      'message:created',
      'conversation:read',
      'realtime:connected',
    ].map((event) => realtime.on(event, refresh));
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      releases.forEach((release) => release());
      window.removeEventListener('focus', refresh);
    };
  }, [api, messaging, realtime, status]);
  if (status !== 'authenticated') return null;
  return (
    <>
      <Link prefetch={false} href="/account/favorites">
        Избранное
      </Link>
      <Link prefetch={false} href="/account/saved-searches">
        Поиски
      </Link>
      <Link prefetch={false} href="/account/messages">
        Сообщения
        {messageCount ? ` (${messageCount > 99 ? '99+' : messageCount})` : ''}
      </Link>
      <Link prefetch={false} href="/account/notifications">
        Уведомления{count ? ` (${count > 99 ? '99+' : count})` : ''}
      </Link>
    </>
  );
}
