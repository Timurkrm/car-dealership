'use client';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { ListingApi } from './listing-api';
import { ListingError } from './listing-feedback';
import { useListingResource } from './listing-resource';
import { SellerBoundary } from './seller-boundary';
import { ListingCard } from './listing-summary';
import { STATUSES, STATUS_LABELS } from './listing-types';
import type { MarketplaceOwnerSummary, Page } from './listing-types';

function ListingList({ owner }: { owner: boolean }) {
  const { client } = useAuth();
  const api = useMemo(() => new ListingApi(client), [client]);
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('created_newest');
  const [reload, setReload] = useState(0);
  const result = useListingResource<Page<MarketplaceOwnerSummary>>(
    useCallback(
      (signal: AbortSignal) => {
        void reload;
        return api.ownList(offset, status, sort, signal, type);
      },
      [api, offset, status, sort, reload, type],
    ),
  );
  return (
    <>
      {owner && (
        <>
          <p>
            <Link href="/sell">Создать объявление</Link>
          </p>
          <div className="form-grid listing-form">
            <label>
              Тип объявления
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Все объявления</option>
                <option value="VEHICLE">Автомобили</option>
                <option value="PART">Запчасти</option>
              </select>
            </label>
            <label>
              Статус
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Все статусы</option>
                {STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {STATUS_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Порядок
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="created_newest">
                  Сначала недавно созданные
                </option>
                <option value="updated_newest">
                  Сначала недавно обновлённые
                </option>
              </select>
            </label>
          </div>
        </>
      )}
      {result.loading && <p role="status">Загружаем объявления…</p>}
      <ListingError error={result.error} />
      {result.error ? (
        <button onClick={() => setReload((value) => value + 1)}>
          Повторить
        </button>
      ) : null}
      {result.value?.items.length === 0 && (
        <p>
          {owner
            ? 'У вас пока нет объявлений с выбранным статусом.'
            : 'Опубликованных автомобилей пока нет.'}
        </p>
      )}
      {result.value?.items.map((listing) => (
        <ListingCard key={listing.id} listing={listing} owner={owner} />
      ))}
      <nav aria-label="Страницы объявлений">
        <button
          disabled={offset === 0 || result.loading}
          onClick={() => setOffset((value) => Math.max(0, value - 20))}
        >
          Назад
        </button>
        <span>Страница {offset / 20 + 1}</span>
        <button
          disabled={!result.value?.hasMore || result.loading || offset >= 10000}
          onClick={() => setOffset((value) => value + 20)}
        >
          Далее
        </button>
      </nav>
    </>
  );
}
export function SellerListScreen() {
  return (
    <main id="main">
      <h1>Мои объявления</h1>
      <SellerBoundary>
        <ListingList owner />
      </SellerBoundary>
    </main>
  );
}
