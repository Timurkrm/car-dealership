'use client';

/* eslint-disable @next/next/no-img-element -- Moderation media uses short-lived object-storage URLs. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthApiError } from '../auth/auth-client';
import { useAuth } from '../auth/auth-provider';
import { WorkspaceApi } from './workspace-api';
import type { ModerationListingDetail, QueueListing } from './workspace-types';
import { formatAge } from './workspace-types';

const REASONS = [
  'INCORRECT_INFORMATION',
  'PROHIBITED_CONTENT',
  'INVALID_PRICE',
  'INVALID_LOCATION',
  'INVALID_PHOTOS',
  'DUPLICATE_LISTING',
  'WRONG_CATEGORY',
  'INSUFFICIENT_INFORMATION',
  'OTHER',
] as const;

export function ModerationDashboard() {
  return (
    <main id="main" className="workspace-page">
      <h1>Модерация</h1>
      <p>Общая очередь Cars и Parts. Решения защищены версией объявления.</p>
      <nav className="workspace-links" aria-label="Разделы модерации">
        <Link href="/moderation/listings">Объявления на проверку</Link>
        <Link href="/moderation/reports">Жалобы пользователей</Link>
      </nav>
    </main>
  );
}

export function ModerationListingQueue() {
  const { client } = useAuth();
  const api = useMemo(() => new WorkspaceApi(client), [client]);
  const abort = useRef<AbortController | null>(null);
  const [type, setType] = useState('');
  const [appliedType, setAppliedType] = useState('');
  const [items, setItems] = useState<QueueListing[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (append = false) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError('');
      try {
        const page = await api.listingQueue(
          {
            type: appliedType || undefined,
            cursor: append ? (cursor ?? undefined) : undefined,
          },
          controller.signal,
        );
        setItems((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setCursor(page.page.nextCursor);
      } catch (requestError) {
        if (!controller.signal.aborted)
          setError(
            requestError instanceof AuthApiError && requestError.status === 403
              ? 'Недостаточно прав.'
              : 'Не удалось загрузить очередь.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [api, appliedType, cursor],
  );
  useEffect(() => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    void api
      .listingQueue({ type: appliedType || undefined }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setCursor(page.page.nextCursor);
        setError('');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Не удалось загрузить очередь.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => abort.current?.abort();
  }, [api, appliedType]);

  return (
    <main id="main" className="workspace-page">
      <h1>Очередь объявлений</h1>
      <form
        className="workspace-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setError('');
          setCursor(null);
          setAppliedType(type);
        }}
      >
        <label>
          Тип
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Cars и Parts</option>
            <option value="VEHICLE">Car</option>
            <option value="PART">Part</option>
          </select>
        </label>
        <button type="submit">Применить</button>
        <button type="button" onClick={() => void load(false)}>
          Обновить
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {loading && items.length === 0 ? <p role="status">Загрузка…</p> : null}
      {!loading && items.length === 0 && !error ? (
        <p>Очередь пуста.</p>
      ) : (
        <ul className="workspace-card-list">
          {items.map((item) => (
            <li key={item.id}>
              {item.cover ? (
                // Processed thumbnail URL is short-lived and refreshed with the queue.
                <img
                  src={item.cover.url}
                  alt=""
                  width={item.cover.width}
                  height={item.cover.height}
                />
              ) : null}
              <div>
                <span className="type-badge">
                  {item.type === 'VEHICLE' ? 'CAR' : 'PART'}
                </span>
                <h2>
                  <Link href={`/moderation/listings/${item.id}`}>
                    {item.title}
                  </Link>
                </h2>
                <p>Продавец: {item.seller.displayName}</p>
                <p>Ожидает: {formatAge(item.submittedAt)}</p>
                <p>Версия: {item.version}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <button disabled={loading} onClick={() => void load(true)}>
          {loading ? 'Загрузка…' : 'Загрузить ещё'}
        </button>
      ) : null}
    </main>
  );
}

export function ModerationListingDetailScreen({ id }: { id: string }) {
  const { client } = useAuth();
  const api = useMemo(() => new WorkspaceApi(client), [client]);
  const [listing, setListing] = useState<ModerationListingDetail | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasonCode, setReasonCode] = useState<(typeof REASONS)[number]>(
    'INCORRECT_INFORMATION',
  );
  const [sellerMessage, setSellerMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setError('');
      try {
        const result = await api.listing(id, signal);
        setListing(result.value);
        setEtag(result.etag);
      } catch {
        if (!signal?.aborted) setError('Не удалось загрузить объявление.');
      }
    },
    [api, id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void api
      .listing(id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setListing(result.value);
        setEtag(result.etag);
        setError('');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Не удалось загрузить объявление.');
      });
    return () => controller.abort();
  }, [api, id]);

  const decide = async (action: 'approve' | 'reject' | 'remove') => {
    if (!listing || !etag) return;
    if (
      !window.confirm(
        action === 'approve'
          ? 'Одобрить объявление?'
          : action === 'remove'
            ? 'Снять объявление с публикации?'
            : 'Отклонить объявление?',
      )
    )
      return;
    if (action !== 'approve' && !sellerMessage.trim()) {
      setError('Укажите сообщение для продавца.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.listingAction(
        id,
        action,
        etag,
        action === 'approve'
          ? {}
          : {
              reasonCode,
              sellerMessage: sellerMessage.trim(),
              ...(internalNote.trim()
                ? { internalNote: internalNote.trim() }
                : {}),
            },
      );
      setListing(updated);
      setEtag(`"${updated.version}"`);
      setNotice(
        action === 'approve'
          ? 'Объявление опубликовано.'
          : action === 'reject'
            ? 'Объявление отклонено.'
            : 'Объявление снято с публикации.',
      );
    } catch (actionError) {
      if (
        actionError instanceof AuthApiError &&
        ['MODERATION_VERSION_CONFLICT', 'MODERATION_INVALID_STATE'].includes(
          actionError.code,
        )
      ) {
        setNotice(
          'Объявление уже было изменено другим сотрудником. Загружено актуальное состояние.',
        );
        await refresh();
      } else setError('Не удалось сохранить решение.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !listing)
    return (
      <main id="main" className="workspace-page">
        <h1>Модерация объявления</h1>
        <p role="alert">{error}</p>
      </main>
    );
  if (!listing)
    return (
      <main id="main" className="workspace-page">
        <h1>Модерация объявления</h1>
        <p role="status">Загрузка…</p>
      </main>
    );
  const subtype = listing.type === 'VEHICLE' ? listing.vehicle : listing.part;
  return (
    <main id="main" className="workspace-page">
      <Link href="/moderation/listings">← К очереди</Link>
      <h1>{listing.title}</h1>
      {notice ? (
        <p role="status" tabIndex={-1}>
          {notice}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <section>
        <h2>Объявление</h2>
        <p>{listing.description}</p>
        <p>
          {listing.price.amountMinor} {listing.price.currency}
        </p>
        <p>
          Статус: {listing.status}; версия: {listing.version}
        </p>
      </section>
      <section>
        <h2>Продавец</h2>
        <p>
          {listing.seller?.displayName} · {listing.seller?.email} ·{' '}
          {listing.seller?.status}
        </p>
      </section>
      <section>
        <h2>{listing.type === 'VEHICLE' ? 'Автомобиль' : 'Запчасть'}</h2>
        <ScalarRecord value={subtype} />
      </section>
      <section>
        <h2>Медиа</h2>
        <ul className="media-gallery">
          {listing.media.map((image) => (
            <li key={image.id}>
              {image.variants ? (
                <img src={image.variants.medium.url} alt="Фото объявления" />
              ) : (
                <span>{image.status}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Местоположение</h2>
        <p>
          <strong>Внутренние приватные данные.</strong> Не передавайте
          координаты третьим лицам.
        </p>
        <ScalarRecord value={listing.location} />
      </section>
      <section>
        <h2>История модерации</h2>
        {listing.moderationHistory.length ? (
          <ul>
            {listing.moderationHistory.map((item) => (
              <li key={item.id}>
                {new Date(item.createdAt).toLocaleString('ru-RU')} ·{' '}
                {item.action} · {item.reasonCode}
                {item.internalNote ? ` · ${item.internalNote}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>Решений ещё нет.</p>
        )}
      </section>
      <section className="decision-panel">
        <h2>Решение</h2>
        {listing.status === 'PENDING_MODERATION' ? (
          <>
            <button disabled={busy} onClick={() => void decide('approve')}>
              Одобрить
            </button>
            <DecisionFields
              reasonCode={reasonCode}
              setReasonCode={setReasonCode}
              sellerMessage={sellerMessage}
              setSellerMessage={setSellerMessage}
              internalNote={internalNote}
              setInternalNote={setInternalNote}
            />
            <button disabled={busy} onClick={() => void decide('reject')}>
              Отклонить
            </button>
          </>
        ) : null}
        {listing.status === 'PUBLISHED' ? (
          <>
            <DecisionFields
              reasonCode={reasonCode}
              setReasonCode={setReasonCode}
              sellerMessage={sellerMessage}
              setSellerMessage={setSellerMessage}
              internalNote={internalNote}
              setInternalNote={setInternalNote}
            />
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void decide('remove')}
            >
              Снять с публикации
            </button>
          </>
        ) : null}
        {!['PENDING_MODERATION', 'PUBLISHED'].includes(listing.status) ? (
          <p>Для текущего состояния нет доступных решений.</p>
        ) : null}
      </section>
    </main>
  );
}

function DecisionFields(props: {
  reasonCode: string;
  setReasonCode: (value: (typeof REASONS)[number]) => void;
  sellerMessage: string;
  setSellerMessage: (value: string) => void;
  internalNote: string;
  setInternalNote: (value: string) => void;
}) {
  return (
    <div className="decision-fields">
      <label>
        Причина
        <select
          value={props.reasonCode}
          onChange={(event) =>
            props.setReasonCode(event.target.value as (typeof REASONS)[number])
          }
        >
          {REASONS.map((reason) => (
            <option key={reason}>{reason}</option>
          ))}
        </select>
      </label>
      <label>
        Сообщение продавцу
        <textarea
          maxLength={2000}
          value={props.sellerMessage}
          onChange={(event) => props.setSellerMessage(event.target.value)}
        />
      </label>
      <label>
        Внутренняя заметка
        <textarea
          maxLength={2000}
          value={props.internalNote}
          onChange={(event) => props.setInternalNote(event.target.value)}
        />
      </label>
    </div>
  );
}

function ScalarRecord({
  value,
}: {
  value: Record<string, unknown> | null | undefined;
}) {
  if (!value) return <p>Нет данных.</p>;
  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item))
      return [[key, String(item ?? '—')] as const];
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      'name' in item &&
      typeof item.name === 'string'
    )
      return [[key, item.name] as const];
    return [];
  });
  return (
    <dl className="workspace-definition">
      {entries.map(([key, item]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{item}</dd>
        </div>
      ))}
    </dl>
  );
}
