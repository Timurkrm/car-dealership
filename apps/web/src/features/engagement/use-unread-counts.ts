'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { useRealtime } from '../realtime/realtime-provider';
import { MessagingClient } from '../messaging/messaging-client';
import { EngagementClient } from './engagement-client';

/** One owner in the persistent header, shared by both responsive presentations. */
export function useUnreadCounts() {
  const { client, status, user } = useAuth();
  const realtime = useRealtime();
  const api = useMemo(() => new EngagementClient(client), [client]);
  const messages = useMemo(() => new MessagingClient(client), [client]);
  const identity = status === 'authenticated' ? user?.id : undefined;
  const [state, setState] = useState<{
    identity?: string;
    notifications: number | null;
    messages: number | null;
  }>({ notifications: null, messages: null });
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    let running = false,
      pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      const [notificationResult, messageResult] = await Promise.allSettled([
        api.unreadCount(controller.signal),
        messages.unread(controller.signal),
      ]);
      if (!controller.signal.aborted)
        setState({
          identity,
          notifications:
            notificationResult.status === 'fulfilled'
              ? notificationResult.value
              : null,
          messages:
            messageResult.status === 'fulfilled' ? messageResult.value : null,
        });
      running = false;
      if (pending && !controller.signal.aborted) {
        pending = false;
        schedule();
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh();
      }, 100);
    };
    void refresh();
    const releases = [
      'notification:created',
      'notification:read',
      'notifications:read-all',
      'message:created',
      'conversation:read',
      'realtime:connected',
    ].map((event) => realtime.on(event, schedule));
    window.addEventListener('focus', schedule);
    return () => {
      controller.abort();
      clearTimeout(timer);
      releases.forEach((release) => release());
      window.removeEventListener('focus', schedule);
    };
  }, [api, messages, realtime, identity]);
  return identity && state.identity === identity
    ? state
    : { notifications: null, messages: null };
}
