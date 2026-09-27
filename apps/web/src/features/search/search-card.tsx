'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { SearchItem } from './search-client';
import { decimalFromMinor } from '../listings/listing-form-model';
import { formatSearchDistance } from './search-parameters';
import { FavoriteButton } from '../engagement/favorite-button';

export function SearchCard({
  listing,
  selected = false,
  onSelect,
}: {
  listing: SearchItem;
  selected?: boolean;
  onSelect?: (listingId: string) => void;
}) {
  const distance = formatSearchDistance(
    listing.location?.distanceMeters ?? null,
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const label =
    listing.type === 'VEHICLE'
      ? `${listing.vehicle.make.name} ${listing.vehicle.model.name}`
      : listing.part.name;
  return (
    <article
      id={`listing-card-${listing.id}`}
      className={`listing-card${selected ? ' listing-card-selected' : ''}`}
      tabIndex={-1}
      onMouseEnter={() => onSelect?.(listing.id)}
      onFocus={() => onSelect?.(listing.id)}
    >
      {failedUrl === listing.cover.url ? (
        <p>Фото недоступно. Нажмите «Обновить выдачу и фотографии».</p>
      ) : (
        <Image
          unoptimized
          src={listing.cover.url}
          width={listing.cover.width}
          height={listing.cover.height}
          onError={() => setFailedUrl(listing.cover.url)}
          alt={`Главное фото: ${label}`}
        />
      )}
      <h2>
        <Link
          href={
            listing.type === 'VEHICLE'
              ? `/listings/${listing.id}`
              : `/parts/${listing.id}`
          }
        >
          {listing.title}
        </Link>
      </h2>
      {listing.type === 'VEHICLE' ? (
        <p>
          {listing.vehicle.make.name} {listing.vehicle.model.name},{' '}
          {listing.vehicle.year} ·{' '}
          {listing.vehicle.mileageKm.toLocaleString('ru-RU')} км
        </p>
      ) : (
        <p>
          {listing.part.name} · {listing.part.category.name} ·{' '}
          {listing.part.brand?.name ?? 'Без бренда'} · {listing.part.condition}
        </p>
      )}
      <p>
        {decimalFromMinor(listing.price.amountMinor, listing.price.currency)}{' '}
        {listing.price.currency}
      </p>
      <p>
        {listing.location
          ? [listing.location.city, listing.location.region]
              .filter(Boolean)
              .join(', ')
          : 'Местоположение не указано'}
        {distance !== null ? ` · ${distance}` : ''}
      </p>
      <FavoriteButton listingId={listing.id} />
    </article>
  );
}
