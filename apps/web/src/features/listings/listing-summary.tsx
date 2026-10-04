import Link from 'next/link';
import Image from 'next/image';
import type {
  MarketplaceOwnerSummary,
  PublicPartSummary,
  PublicListingSummary,
  Vehicle,
} from './listing-types';
import { ListingStatusBadge } from './listing-status-badge';
import { decimalFromMinor } from './listing-form-model';

export function ListingDescription({
  description,
}: {
  description: string | null;
}) {
  return (
    <p className="listing-description">
      {description ?? 'Описание не указано'}
    </p>
  );
}

export function VehicleDetails({ vehicle }: { vehicle: Vehicle }) {
  return (
    <dl className="vehicle-details">
      <dt>Автомобиль</dt>
      <dd>
        {vehicle.make.name} {vehicle.model.name}{' '}
        {vehicle.generation?.name ?? ''}
      </dd>
      <dt>Год</dt>
      <dd>{vehicle.year}</dd>
      <dt>Пробег</dt>
      <dd>{vehicle.mileageKm} км</dd>
      <dt>Кузов / топливо</dt>
      <dd>
        {vehicle.bodyType} / {vehicle.fuelType}
      </dd>
      <dt>Коробка / привод</dt>
      <dd>
        {vehicle.transmission} / {vehicle.driveType}
      </dd>
      <dt>Состояние / цвет</dt>
      <dd>
        {vehicle.condition} / {vehicle.color ?? 'Не указан'}
      </dd>
      {vehicle.enginePowerHp !== null && (
        <>
          <dt>Мощность</dt>
          <dd>{vehicle.enginePowerHp} л. с.</dd>
        </>
      )}
      {vehicle.engineDisplacementCc !== null && (
        <>
          <dt>Объём двигателя</dt>
          <dd>{vehicle.engineDisplacementCc} см³</dd>
        </>
      )}
    </dl>
  );
}
export function ListingCard({
  listing,
  owner = false,
}: {
  listing: MarketplaceOwnerSummary | PublicListingSummary | PublicPartSummary;
  owner?: boolean;
}) {
  return (
    <article className="listing-card">
      {listing.cover && (
        <Image
          unoptimized
          src={listing.cover.url}
          width={listing.cover.width}
          height={listing.cover.height}
          alt={`Главное фото: ${listing.title}`}
        />
      )}
      <h2>
        <Link
          href={`${owner ? '/account/listings' : listing.type === 'PART' ? '/parts' : '/listings'}/${listing.id}`}
        >
          {listing.title}
        </Link>
      </h2>
      <p>{listing.type === 'PART' ? 'Запчасть' : 'Автомобиль'}</p>
      {listing.type === 'PART' ? (
        <p>
          {listing.part.name} · {listing.part.category.name} · Остаток:{' '}
          {listing.part.quantityAvailable} ·{' '}
          {listing.part.fitment.mode === 'UNIVERSAL'
            ? 'Универсальная'
            : `Совместимость: ${listing.part.fitment.count} вариантов`}
        </p>
      ) : (
        <p>
          {listing.vehicle.make.name} {listing.vehicle.model.name},{' '}
          {listing.vehicle.year} — {listing.vehicle.mileageKm} км
        </p>
      )}
      <p>
        <span className="ui-price">
          {decimalFromMinor(listing.price.amountMinor, listing.price.currency)}{' '}
          {listing.price.currency}
        </span>{' '}
        <ListingStatusBadge status={listing.status} />
      </p>
      {owner && 'updatedAt' in listing && (
        <p>
          Обновлено:{' '}
          <time dateTime={listing.updatedAt}>
            {new Date(listing.updatedAt).toLocaleString('ru-RU', {
              timeZone: 'UTC',
            })}{' '}
            UTC
          </time>
        </p>
      )}
      <p>
        {listing.location
          ? `${listing.location.city}${listing.location.region ? `, ${listing.location.region}` : ''}, ${listing.location.countryCode}`
          : 'Местоположение не указано'}
      </p>
    </article>
  );
}
