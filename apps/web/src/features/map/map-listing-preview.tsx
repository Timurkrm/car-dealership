'use client';
import Image from 'next/image';
import Link from 'next/link';
import type {
  PartMapFeature,
  VehicleMapFeature,
} from '../search/search-client';
import { decimalFromMinor } from '../listings/listing-form-model';
import { formatSearchDistance } from '../search/search-parameters';

export function MapListingPreview({
  feature,
  onClose,
}: {
  feature: VehicleMapFeature | PartMapFeature;
  onClose: () => void;
}) {
  const distance = formatSearchDistance(feature.location.distanceMeters);
  return (
    <article className="map-preview" aria-label="Выбранное объявление">
      <button
        className="map-preview-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        ×
      </button>
      <Image
        unoptimized
        src={feature.cover.url}
        width={feature.cover.width}
        height={feature.cover.height}
        alt=""
      />
      <div>
        <h2>{feature.title}</h2>
        {feature.type === 'VEHICLE' ? (
          <p>
            {feature.vehicle.make} {feature.vehicle.model},{' '}
            {feature.vehicle.year} ·{' '}
            {feature.vehicle.mileageKm.toLocaleString('ru-RU')} км
          </p>
        ) : (
          <p>
            {feature.part.name} · {feature.part.category} ·{' '}
            {feature.part.brand ?? 'Без бренда'} · {feature.part.condition} ·{' '}
            {feature.part.fitment.mode === 'UNIVERSAL'
              ? 'Универсальная'
              : `${feature.part.fitment.count} совместимостей`}
          </p>
        )}
        <p>
          {decimalFromMinor(feature.price.amountMinor, feature.price.currency)}{' '}
          {feature.price.currency}
        </p>
        <p>
          {[feature.location.city, feature.location.region]
            .filter(Boolean)
            .join(', ')}
          {distance ? ` · ${distance}` : ''}
        </p>
        <Link
          href={
            feature.type === 'VEHICLE'
              ? `/listings/${feature.listingId}`
              : `/parts/${feature.listingId}`
          }
        >
          Открыть объявление
        </Link>
      </div>
    </article>
  );
}
