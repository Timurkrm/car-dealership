import Link from 'next/link';
import type { ReactNode } from 'react';
import { ResultInteraction } from './result-interaction';
import type { ResultInteractionProps } from './result-interaction';
import { Icon } from '../../components/ui/icon';
import { resultPrice, formatSearchDistance } from './result-format';

export function ResultPrice({
  price,
  unit = false,
}: {
  price: { amountMinor: string; currency: string };
  unit?: boolean;
}) {
  return (
    <p className="result-price">
      <span className="ui-price">
        {resultPrice(price.amountMinor, price.currency)}
      </span>
      {unit && <span className="result-unit"> / шт.</span>}
    </p>
  );
}
export function ResultLocation({
  location,
}: {
  location: {
    city: string;
    region: string | null;
    distanceMeters?: number | null;
  } | null;
}) {
  if (!location) return null;
  const label = [location.city, location.region].filter(Boolean).join(', ');
  const distance = formatSearchDistance(location.distanceMeters ?? null);
  if (!label && !distance) return null;
  return (
    <p className="result-location">
      <Icon name="location" />
      <span>
        {label}
        {label && distance ? ' · ' : ''}
        {distance}
      </span>
    </p>
  );
}
export function ResultCardShell({
  id,
  title,
  href,
  media,
  favorite,
  price,
  location,
  children,
  status,
  headingLevel = 2,
  onNavigate,
  ...interaction
}: ResultInteractionProps & {
  id: string;
  title: string;
  href: string;
  media: ReactNode;
  favorite?: ReactNode;
  price: ReactNode;
  location?: ReactNode;
  children: ReactNode;
  status?: ReactNode;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <ResultInteraction id={id} {...interaction}>
      {media}
      <div className="result-body">
        {status && <div className="result-status">{status}</div>}
        <Heading className="result-title">
          <Link prefetch={false} href={href} onClick={onNavigate}>
            {title}
          </Link>
        </Heading>
        {price}
        <div className="result-metadata">{children}</div>
        {location}
      </div>
      {favorite && <div className="result-favorite">{favorite}</div>}
    </ResultInteraction>
  );
}
