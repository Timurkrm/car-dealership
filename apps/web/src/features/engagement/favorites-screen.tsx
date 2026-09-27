'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { decimalFromMinor } from '../listings/listing-form-model';
import { EngagementClient } from './engagement-client';
import type { FavoriteItem, ListingType } from './engagement-client';

export function FavoritesScreen() {
  const { client } = useAuth(),
    api = useMemo(() => new EngagementClient(client), [client]);
  const [items, setItems] = useState<FavoriteItem[]>([]),
    [type, setType] = useState<ListingType | undefined>(),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const load = useCallback(
    async (next?: string, append = false, signal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      try {
        const result = await api.favorites(type, next, signal);
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
    [api, type],
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
  return (
    <>
      <div className="workspace-filters">
        <label>
          Тип{' '}
          <select
            value={type ?? ''}
            onChange={(event) =>
              setType(
                (event.target.value || undefined) as ListingType | undefined,
              )
            }
          >
            <option value="">Все</option>
            <option value="VEHICLE">Автомобили</option>
            <option value="PART">Запчасти</option>
          </select>
        </label>
      </div>
      {loading && !items.length ? (
        <p role="status">Загружаем избранное…</p>
      ) : null}
      {error ? (
        <p role="alert">
          Не удалось загрузить избранное.{' '}
          <button onClick={() => void load()}>Повторить</button>
        </p>
      ) : null}
      {!loading && !error && !items.length ? (
        <p>В избранном пока ничего нет.</p>
      ) : null}
      <ul className="workspace-card-list">
        {items.map((item) => (
          <li key={item.listingId}>
            {item.kind === 'UNAVAILABLE' ? (
              <>
                <div aria-hidden="true">—</div>
                <div>
                  <h2>Объявление недоступно</h2>
                  <p>
                    Содержимое скрыто, потому что объявление больше не является
                    публичным.
                  </p>
                  <Remove
                    id={item.listingId}
                    api={api}
                    onDone={() =>
                      setItems((rows) =>
                        rows.filter((row) => row.listingId !== item.listingId),
                      )
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <Image
                  unoptimized
                  src={item.cover.url}
                  width={item.cover.width}
                  height={item.cover.height}
                  alt=""
                />
                <div>
                  <span className="type-badge">
                    {item.kind === 'VEHICLE' ? 'Автомобиль' : 'Запчасть'}
                  </span>
                  <h2>
                    <Link
                      href={`${item.kind === 'PART' ? '/parts' : '/listings'}/${item.listingId}`}
                    >
                      {item.title}
                    </Link>
                  </h2>
                  <p>
                    {item.kind === 'VEHICLE'
                      ? `${item.vehicle?.make.name} ${item.vehicle?.model.name}, ${item.vehicle?.year}`
                      : `${item.part?.name} · ${item.part?.category.name}`}
                  </p>
                  <p>
                    {decimalFromMinor(
                      item.price.amountMinor,
                      item.price.currency,
                    )}{' '}
                    {item.price.currency}
                    {item.availability === 'SOLD' ? ' · Продано' : ''}
                  </p>
                  <Remove
                    id={item.listingId}
                    api={api}
                    onDone={() =>
                      setItems((rows) =>
                        rows.filter((row) => row.listingId !== item.listingId),
                      )
                    }
                  />
                </div>
              </>
            )}
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

function Remove({
  id,
  api,
  onDone,
}: {
  id: string;
  api: EngagementClient;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void api
          .unfavorite(id)
          .then(onDone)
          .finally(() => setBusy(false));
      }}
    >
      Удалить из избранного
    </button>
  );
}
