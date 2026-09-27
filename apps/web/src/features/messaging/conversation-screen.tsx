'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/auth-provider';
import { useRealtime } from '../realtime/realtime-provider';
import { MessagingClient, parseMessage } from './messaging-client';
import { mergeMessages } from './message-state';
import type { DisplayMessage } from './message-state';

export function ConversationScreen({ id }: { id: string }) {
  const { client, user } = useAuth();
  const api = useMemo(() => new MessagingClient(client), [client]);
  const realtime = useRealtime();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('Диалог');
  const [error, setError] = useState(false);
  const [newMessageNotice, setNewMessageNotice] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [canSend, setCanSend] = useState(true);
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);
  const scrollToBottom = useCallback(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    stickToBottom.current = true;
    setNewMessageNotice(false);
  }, []);
  const reconcile = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [detail, page] = await Promise.all([
          api.detail(id, signal),
          api.history(id, undefined, signal),
        ]);
        const listing = detail.listing;
        if (
          listing &&
          typeof listing === 'object' &&
          'title' in listing &&
          typeof listing.title === 'string'
        )
          setTitle(listing.title);
        setCanSend(detail.canSend);
        setMessages((current) =>
          mergeMessages(
            current.filter((item) => item.delivery === 'failed'),
            page.items,
          ),
        );
        setCursor(page.page.nextCursor);
        setError(false);
      } catch {
        if (!signal?.aborted) setError(true);
      }
    },
    [api, id],
  );
  useEffect(() => {
    const controller = new AbortController();
    const bootstrap = window.setTimeout(
      () => void reconcile(controller.signal),
      0,
    );
    void realtime
      .command('conversation:subscribe', { conversationId: id })
      .catch(() => undefined);
    const onMessage = (payload?: unknown) => {
      try {
        const message = parseMessage(payload);
        if (message.conversationId === id) {
          setMessages((rows) => mergeMessages(rows, [message]));
          setAnnouncement('Новое сообщение');
          if (stickToBottom.current) requestAnimationFrame(scrollToBottom);
          else setNewMessageNotice(true);
          if (message.senderId !== user?.id) void api.markRead(id, message.id);
        }
      } catch {
        /* malformed realtime payload is ignored; HTTP reconciliation is authoritative */
      }
    };
    const offMessage = realtime.on('message:created', onMessage);
    const offConnected = realtime.on('realtime:connected', () => {
      void realtime
        .command('conversation:subscribe', { conversationId: id })
        .catch(() => undefined);
      void reconcile();
    });
    const focus = () => void reconcile();
    window.addEventListener('focus', focus);
    return () => {
      window.clearTimeout(bootstrap);
      controller.abort();
      offMessage();
      offConnected();
      window.removeEventListener('focus', focus);
      void realtime
        .command('conversation:unsubscribe', { conversationId: id })
        .catch(() => undefined);
    };
  }, [api, id, realtime, reconcile, scrollToBottom, user?.id]);
  useEffect(() => {
    const newest = [...messages]
      .reverse()
      .find((message) => message.senderId !== user?.id && !message.delivery);
    if (newest) void api.markRead(id, newest.id);
  }, [api, id, messages, user?.id]);
  useEffect(() => {
    if (stickToBottom.current) requestAnimationFrame(scrollToBottom);
  }, [messages, scrollToBottom]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    const value = body.trim();
    if (!value) return;
    const clientMessageId = crypto.randomUUID();
    const optimistic: DisplayMessage = {
      id: clientMessageId,
      conversationId: id,
      senderId: user?.id ?? clientMessageId,
      clientMessageId,
      body: value,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      delivery: 'sending',
    };
    stickToBottom.current = true;
    setMessages((rows) => mergeMessages(rows, [optimistic]));
    requestAnimationFrame(scrollToBottom);
    setBody('');
    await deliver(optimistic);
  }
  async function deliver(optimistic: DisplayMessage) {
    try {
      const persisted = await api.send(
        id,
        optimistic.clientMessageId,
        optimistic.body ?? '',
      );
      setMessages((rows) =>
        mergeMessages(
          rows.filter(
            (row) => row.clientMessageId !== optimistic.clientMessageId,
          ),
          [persisted],
        ),
      );
    } catch {
      setMessages((rows) =>
        rows.map((row) =>
          row.clientMessageId === optimistic.clientMessageId
            ? { ...row, delivery: 'failed' }
            : row,
        ),
      );
    }
  }
  return (
    <>
      <p>
        <Link href="/account/messages">Все диалоги</Link>
      </p>
      <h1>{title}</h1>
      {error ? (
        <p role="alert">
          Не удалось синхронизировать сообщения.{' '}
          <button onClick={() => void reconcile()}>Повторить</button>
        </p>
      ) : null}
      {cursor ? (
        <button
          onClick={() => {
            stickToBottom.current = false;
            void api.history(id, cursor).then((page) => {
              setMessages((rows) => mergeMessages(page.items, rows));
              setCursor(page.page.nextCursor);
            });
          }}
        >
          Загрузить предыдущие
        </button>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ol
        className="message-list"
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          stickToBottom.current =
            list.scrollHeight - list.scrollTop - list.clientHeight < 80;
          if (stickToBottom.current) setNewMessageNotice(false);
        }}
      >
        {messages.map((message) => (
          <li
            key={`${message.id}:${message.clientMessageId}`}
            className={message.senderId === user?.id ? 'message-own' : ''}
          >
            <p>{message.body ?? 'Сообщение удалено'}</p>
            <small>
              {new Date(message.createdAt).toLocaleString('ru-RU')}
              {message.delivery === 'sending' ? ' · отправляется' : ''}
            </small>
            {message.delivery === 'failed' ? (
              <button
                onClick={() =>
                  void deliver({ ...message, delivery: 'sending' })
                }
              >
                Повторить отправку
              </button>
            ) : null}
            {!message.delivery && message.senderId !== user?.id ? (
              <button
                onClick={() =>
                  void api
                    .report(message.id)
                    .then(() => window.alert('Жалоба отправлена.'))
                }
              >
                Пожаловаться
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {newMessageNotice ? (
        <button type="button" onClick={scrollToBottom}>
          Новые сообщения
        </button>
      ) : null}
      {!canSend ? (
        <p role="status">
          Объявление снято модератором. История доступна только для чтения.
        </p>
      ) : null}
      <form className="message-composer" onSubmit={submit}>
        <label htmlFor="message-body">Сообщение</label>
        <textarea
          id="message-body"
          value={body}
          maxLength={8000}
          rows={4}
          disabled={!canSend}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button disabled={!canSend || !body.trim()}>Отправить</button>
      </form>
    </>
  );
}
