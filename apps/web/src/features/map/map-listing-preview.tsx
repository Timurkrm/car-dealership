'use client';
import Link from 'next/link';
import type {
  PartMapFeature,
  VehicleMapFeature,
} from '../search/search-client';
import { ResultMedia } from '../results/result-media';
import { ResultPrice, ResultLocation } from '../results/result-card-shell';
import { PART_CONDITION_LABELS } from '../parts/part-labels';
import { Button } from '../../components/ui/button';

export function MapListingPreview({
  feature,
  onClose,
  onNavigate,
}: {
  feature: VehicleMapFeature | PartMapFeature;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  return (
    <article className="map-preview" aria-label="Выбранное объявление">
      <Button
        variant="ghost"
        className="map-preview-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        ×
      </Button>
      <ResultMedia
        cover={feature.cover}
        type={feature.type}
        label={feature.title}
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
            {[
              feature.part.brand,
              PART_CONDITION_LABELS[
                feature.part.condition as keyof typeof PART_CONDITION_LABELS
              ],
            ]
              .filter(Boolean)
              .join(' · ')}{' '}
            ·{' '}
            {feature.part.fitment.mode === 'UNIVERSAL'
              ? 'Универсальная'
              : `${feature.part.fitment.count} совместимостей`}
          </p>
        )}
        <ResultPrice price={feature.price} unit={feature.type === 'PART'} />
        <ResultLocation location={feature.location} />
        <Link
          prefetch={false}
          onClick={onNavigate}
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
