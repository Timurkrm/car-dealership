import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container, Section } from '../../components/ui/layout';
import { Alert } from '../../components/ui/feedback';
import { Icon } from '../../components/ui/icon';
import { MediaGallery } from '../media/media-gallery';
import { FavoriteButton } from '../engagement/favorite-button';
import { ContactSellerButton } from '../messaging/contact-seller-button';
import { ListingStatusBadge } from '../listings/listing-status-badge';
import { resultPrice } from '../results/result-format';
import { catalogUrl } from '../map/map-state';
import type { PublicLocation } from '../listings/listing-types';
import type { PublicDetail } from './detail-model';
import { DetailRefresh } from './detail-refresh';

export function DetailLocation({ location, type }: { location: PublicLocation | null; type: PublicDetail['type'] }) {
  return <Section className="detail-section" aria-labelledby="detail-location">
    <h2 id="detail-location">Местоположение</h2>
    <p><Icon name="location" /> {location ? [location.city, location.region, location.countryCode].filter(Boolean).join(', ') : 'Местоположение не указано'}</p>
    {location?.publicPoint && <><p className="ui-metadata">Приблизительное местоположение, указанное продавцом.</p>
      <Link prefetch={false} href={catalogUrl(type === 'PART' ? '/parts' : '/cars', {}, {view:'map', camera:{...location.publicPoint, zoom:12}})}>Посмотреть область на карте</Link></>}
  </Section>;
}
export function DetailShell({ listing, sellerIdentity, facts, children }: {
  listing: PublicDetail; sellerIdentity: string; facts: ReactNode; children: ReactNode;
}) {
  const catalog = listing.type === 'PART' ? '/parts' : '/cars';
  return <Container as="main" id="main" width="public" density="public" className={`listing-detail detail-${listing.type.toLowerCase()}`}>
    <nav aria-label="Хлебные крошки" className="detail-breadcrumb"><Link prefetch={false} href={catalog}>{listing.type === 'PART' ? 'Все запчасти' : 'Все автомобили'}</Link><span aria-hidden="true"> / </span><span>Объявление</span></nav>
    <div className="detail-top">
      <MediaGallery key={listing.media?.map(photo => photo.variants?.medium.url).join('|')} photos={listing.media ?? []} title={listing.title} type={listing.type} />
      <div className="detail-summary">
        <div className="detail-heading"><ListingStatusBadge status={listing.status} /><h1>{listing.title}</h1></div>
        <p className="detail-price">{resultPrice(listing.price.amountMinor, listing.price.currency)}{listing.type === 'PART' && <span> / шт.</span>}</p>
        {facts}
        {listing.status === 'SOLD' && <Alert>Объявление продано. Новый чат недоступен; существующая переписка остаётся в разделе сообщений.</Alert>}
        <div className="detail-actions" aria-label="Действия с объявлением">
          <FavoriteButton listingId={listing.id} variant="icon" />
          <ContactSellerButton listingId={listing.id} sellerIdentity={sellerIdentity} published={listing.status === 'PUBLISHED'} />
        </div>
        <section className="detail-seller" aria-labelledby="detail-seller"><Icon name="user" /><div><h2 id="detail-seller">Продавец</h2><p>{listing.seller.displayName}</p></div></section>
        <DetailRefresh />
      </div>
    </div>
    <div className="detail-sections">
      {children}
      <Section className="detail-section" aria-labelledby="detail-description"><h2 id="detail-description">Описание</h2><p className="detail-description">{listing.description?.trim() ? listing.description : 'Описание не указано'}</p></Section>
      <DetailLocation location={listing.location} type={listing.type} />
    </div>
  </Container>;
}
