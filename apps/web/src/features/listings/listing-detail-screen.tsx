'use client';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { ListingApi } from './listing-api';
import { useListingResource } from './listing-resource';
import { ListingError } from './listing-feedback';
import { ListingForm } from './listing-form';
import { decimalFromMinor, isVersionConflict } from './listing-form-model';
import { ListingDescription, VehicleDetails } from './listing-summary';
import { SellerBoundary } from './seller-boundary';
import { STATUS_LABELS } from './listing-types';
import type { OwnerResult } from './listing-types';
import { PartApi } from '../parts/part-api';
import { PartForm } from '../parts/part-form';
import { PartDetails } from '../parts/part-details';
import { MediaEditor } from '../media/media-editor';
import { MediaGallery } from '../media/media-gallery';
import { FavoriteButton } from '../engagement/favorite-button';
import { ContactSellerButton } from '../messaging/contact-seller-button';

function OwnerDetail({ id }: { id: string }) {
  const { client } = useAuth();
  const api = useMemo(() => new ListingApi(client), [client]);
  const partApi = useMemo(() => new PartApi(client), [client]);
  const [reload, setReload] = useState(0);
  const [replacement, setReplacement] = useState<OwnerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState(false);
  const resource = useListingResource(
    useCallback(
      (signal: AbortSignal) => {
        void reload;
        return api.ownDetail(id, signal);
      },
      [api, id, reload],
    ),
  );
  const result = replacement ?? resource.value;
  async function write(work: () => Promise<OwnerResult>, message: string) {
    if (busy || conflict) return;
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      setReplacement(await work());
      setSuccess(message);
    } catch (failure) {
      setError(failure);
      if (isVersionConflict(failure)) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading && !replacement)
    return <p role="status">Загружаем объявление…</p>;
  if (!result)
    return (
      <>
        <ListingError error={resource.error} />
        <button onClick={() => setReload((value) => value + 1)}>
          Повторить
        </button>
      </>
    );
  const { listing, etag } = result;
  const editable = listing.status === 'DRAFT' || listing.status === 'REJECTED';
  return (
    <>
      <h2>{listing.title}</h2>
      <p>
        {STATUS_LABELS[listing.status]} ·{' '}
        {decimalFromMinor(listing.price.amountMinor, listing.price.currency)}{' '}
        {listing.price.currency}
      </p>
      <ListingError error={error} />
      {success && <p role="status">{success}</p>}
      <button
        disabled={busy}
        onClick={() => {
          if (
            editable &&
            !window.confirm(
              'Обновить данные? Несохранённые изменения формы будут потеряны.',
            )
          )
            return;
          setReplacement(null);
          setError(null);
          setSuccess('');
          setConflict(false);
          setReload((value) => value + 1);
        }}
      >
        Обновить данные
      </button>
      {editable && listing.type === 'PART' ? (
        <PartForm
          key={etag}
          api={partApi}
          vehicleApi={api}
          initial={listing}
          disabled={busy || conflict}
          onError={setError}
          onSave={(body) =>
            write(() => partApi.update(id, etag, body), 'Изменения сохранены.')
          }
        />
      ) : editable && listing.type === 'VEHICLE' ? (
        <ListingForm
          key={etag}
          api={api}
          initial={listing}
          disabled={busy || conflict}
          onError={setError}
          onSave={(body) =>
            write(() => api.update(id, etag, body), 'Изменения сохранены.')
          }
        />
      ) : (
        <>
          {listing.type === 'VEHICLE' ? (
            <VehicleDetails vehicle={listing.vehicle} />
          ) : (
            <PartDetails part={listing.part} />
          )}
          <ListingDescription description={listing.description} />
          {listing.type === 'VEHICLE' && (
            <p>VIN: {listing.vehicle.vin ?? 'Не указан'}</p>
          )}
          {listing.location && (
            <p>
              Точная точка (только для вас):{' '}
              {listing.location.exactPoint.latitude},{' '}
              {listing.location.exactPoint.longitude}
            </p>
          )}
        </>
      )}
      <MediaEditor listingId={id} editable={editable && !busy && !conflict} />
      <div className="auth-actions">
        {editable && (
          <button
            disabled={busy || conflict}
            onClick={() =>
              void write(
                () => api.action(id, etag, 'submit'),
                'Объявление отправлено на модерацию.',
              )
            }
          >
            Отправить на модерацию
          </button>
        )}
        {listing.status === 'PUBLISHED' && (
          <button
            disabled={busy || conflict}
            onClick={() => {
              if (
                window.confirm(
                  'Закрыть объявление как проданное? Для запчасти остаток станет нулём.',
                )
              )
                void write(
                  () => api.action(id, etag, 'mark-sold'),
                  'Объявление отмечено как проданное.',
                );
            }}
          >
            Отметить как проданное
          </button>
        )}
        {listing.status !== 'ARCHIVED' && (
          <button
            disabled={busy || conflict}
            onClick={() => {
              if (window.confirm('Снять объявление и переместить в архив?'))
                void write(
                  () => api.action(id, etag, 'archive'),
                  'Объявление архивировано.',
                );
            }}
          >
            Архивировать
          </button>
        )}
      </div>
      {editable && (
        <p>Перед отправкой на модерацию сохраните изменения формы.</p>
      )}
      {(listing.status === 'PUBLISHED' || listing.status === 'SOLD') && (
        <p>
          <Link
            href={`${listing.type === 'PART' ? '/parts' : '/listings'}/${listing.id}`}
          >
            Открыть публичную страницу
          </Link>
        </p>
      )}
    </>
  );
}
export function SellerDetailScreen({ id }: { id: string }) {
  return (
    <main id="main">
      <h1>Управление объявлением</h1>
      <p>
        <Link href="/account/listings">Мои объявления</Link>
      </p>
      <SellerBoundary>
        <OwnerDetail key={id} id={id} />
      </SellerBoundary>
    </main>
  );
}
export function PublicDetailScreen({ id }: { id: string }) {
  const { client } = useAuth();
  const api = useMemo(() => new ListingApi(client), [client]);
  const [reload, setReload] = useState(0);
  const resource = useListingResource(
    useCallback(
      (signal: AbortSignal) => {
        void reload;
        return api.publicDetail(id, signal);
      },
      [api, id, reload],
    ),
  );
  const listing = resource.value;
  return (
    <main id="main">
      <p>
        <Link href="/cars">Все автомобили</Link>
      </p>
      <h1>{listing?.title ?? 'Объявление'}</h1>
      {resource.loading && <p role="status">Загружаем автомобиль…</p>}
      <ListingError error={resource.error} />
      {resource.error ? (
        <button onClick={() => setReload((value) => value + 1)}>
          Повторить
        </button>
      ) : null}
      {listing && (
        <>
          <FavoriteButton listingId={listing.id} />
          <ContactSellerButton
            listingId={listing.id}
            sellerId={listing.seller.id}
          />
          <p>
            {decimalFromMinor(
              listing.price.amountMinor,
              listing.price.currency,
            )}{' '}
            {listing.price.currency} · {STATUS_LABELS[listing.status]}
          </p>
          <VehicleDetails vehicle={listing.vehicle} />
          <h2>Описание</h2>
          <MediaGallery photos={listing.media ?? []} />
          <button onClick={() => setReload((value) => value + 1)}>
            Обновить фотографии
          </button>
          <ListingDescription description={listing.description} />
          <h2>Местоположение</h2>
          <p>
            {listing.location
              ? `${listing.location.city}${listing.location.region ? `, ${listing.location.region}` : ''}, ${listing.location.countryCode}`
              : 'Не указано'}
          </p>
          {listing.location?.publicPoint && (
            <p>
              Публичная точка: {listing.location.publicPoint.latitude},{' '}
              {listing.location.publicPoint.longitude}
            </p>
          )}
          <h2>Продавец</h2>
          <p>{listing.seller.displayName}</p>
        </>
      )}
    </main>
  );
}
