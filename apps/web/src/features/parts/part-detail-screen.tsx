'use client';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { ListingError } from '../listings/listing-feedback';
import { useListingResource } from '../listings/listing-resource';
import { decimalFromMinor } from '../listings/listing-form-model';
import { STATUS_LABELS } from '../listings/listing-types';
import { ListingDescription } from '../listings/listing-summary';
import { MediaGallery } from '../media/media-gallery';
import { PartApi } from './part-api';
import { PartDetails } from './part-details';
import { FavoriteButton } from '../engagement/favorite-button';
import { ContactSellerButton } from '../messaging/contact-seller-button';
export function PartDetailScreen({ id }: { id: string }) {
  const { client } = useAuth();
  const api = useMemo(() => new PartApi(client), [client]);
  const [reload, setReload] = useState(0);
  const result = useListingResource(
    useCallback(
      (signal: AbortSignal) => {
        void reload;
        return api.detail(id, signal);
      },
      [api, id, reload],
    ),
  );
  const listing = result.value;
  return (
    <main id="main">
      <Link prefetch={false} href="/parts">
        Все запчасти
      </Link>
      <h1>{listing?.title ?? 'Запчасть'}</h1>
      {result.loading && <p role="status">Загружаем запчасть…</p>}
      <ListingError error={result.error} />
      <button onClick={() => setReload((value) => value + 1)}>
        Обновить объявление и фотографии
      </button>
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
            {listing.price.currency} за единицу ·{' '}
            {STATUS_LABELS[listing.status]}
          </p>
          <MediaGallery photos={listing.media ?? []} />
          <PartDetails part={listing.part} />
          <h2>Описание</h2>
          <ListingDescription description={listing.description} />
          <h2>Местоположение</h2>
          <p>
            {listing.location
              ? [
                  listing.location.city,
                  listing.location.region,
                  listing.location.countryCode,
                ]
                  .filter(Boolean)
                  .join(', ')
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
