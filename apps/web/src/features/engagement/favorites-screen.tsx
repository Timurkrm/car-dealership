'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { FavoriteResult } from '../results/favorite-result';
import { ResultLayout, ResultLoading } from '../results/result-layout';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import { useFavoriteState } from './favorite-provider';
import { EngagementClient } from './engagement-client';
import type { FavoriteItem, ListingType } from './engagement-client';

export function FavoritesScreen() {
  const { client } = useAuth(),
    api = useMemo(() => new EngagementClient(client), [client]);
  const favoriteState = useFavoriteState();
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
        if (signal?.aborted) return;
        favoriteState.observe(result.items.map((item) => item.listingId));
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
    [api, type, favoriteState],
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
        <>
          <p role="status">Загружаем избранное…</p>
          <ResultLoading />
        </>
      ) : null}
      {error ? (
        <ErrorState
          title="Не удалось загрузить избранное"
          description="Попробуйте ещё раз."
          onRetry={() => void load()}
        />
      ) : null}
      {!loading && !error && !items.length ? (
        <EmptyState title="В избранном пока ничего нет." />
      ) : null}
      <ResultLayout>
        {items.map((item) => (
          <FavoriteResult
            key={item.listingId}
            item={item}
            onRemoved={() =>
              setItems((rows) =>
                rows.filter((row) => row.listingId !== item.listingId),
              )
            }
          />
        ))}
      </ResultLayout>
      {cursor ? (
        <button disabled={loading} onClick={() => void load(cursor, true)}>
          Показать ещё
        </button>
      ) : null}
    </>
  );
}
