'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { serializeSearchParameters } from '../search/search-parameters';
import { EngagementClient } from './engagement-client';
import type { SavedSearchItem } from './engagement-client';

export function SavedSearchesScreen() {
  const { client } = useAuth(),
    api = useMemo(() => new EngagementClient(client), [client]);
  const [items, setItems] = useState<SavedSearchItem[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      try {
        setItems(await api.savedSearches(signal));
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
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  return (
    <>
      {loading ? <p role="status">Загружаем сохранённые поиски…</p> : null}
      {error ? (
        <p role="alert">
          Не удалось загрузить поиски.{' '}
          <button onClick={() => void load()}>Повторить</button>
        </p>
      ) : null}
      {!loading && !error && !items.length ? (
        <p>
          Сохранённых поисков пока нет. Настройте фильтры в каталоге Cars или
          Parts.
        </p>
      ) : null}
      <ul className="workspace-card-list">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <span className="type-badge">
                {item.type === 'VEHICLE' ? 'Автомобили' : 'Запчасти'}
              </span>
            </div>
            <div>
              <h2>{item.name}</h2>
              {item.supported ? (
                <>
                  <p>
                    <Link
                      prefetch={false}
                      href={`${item.type === 'VEHICLE' ? '/cars' : '/parts'}?${serializeSearchParameters(item.filters)}`}
                    >
                      Открыть поиск
                    </Link>
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.notificationsEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setItems((rows) =>
                          rows.map((row) =>
                            row.id === item.id
                              ? { ...row, notificationsEnabled: enabled }
                              : row,
                          ),
                        );
                        void api
                          .updateSavedSearch(item.id, {
                            notificationsEnabled: enabled,
                          })
                          .catch(() => void load());
                      }}
                    />{' '}
                    Уведомлять о новых объявлениях
                  </label>
                </>
              ) : (
                <p>
                  Эта версия фильтров больше не поддерживается. Создайте поиск
                  заново.
                </p>
              )}
              <p>
                <button
                  className="danger-button"
                  onClick={() =>
                    void api
                      .removeSavedSearch(item.id)
                      .then(() =>
                        setItems((rows) =>
                          rows.filter((row) => row.id !== item.id),
                        ),
                      )
                  }
                >
                  Удалить
                </button>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
