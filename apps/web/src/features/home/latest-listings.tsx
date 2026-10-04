import { MarketplaceResult } from '../results/marketplace-result';
import { ResultLayout, ResultLoading } from '../results/result-layout';
import type { LatestState } from './home-listings';
import { loadLatestListings } from './home-listings';
import type { SearchListingType } from '../search/search-client';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import { ButtonLink } from '../../components/ui/button';

export function LatestContent({
  state,
  type,
}: {
  state: LatestState;
  type: SearchListingType;
}) {
  const href = type === 'VEHICLE' ? '/cars' : '/parts';
  if (state.status === 'error')
    return (
      <div className="home-latest-state">
        <ErrorState
          title="Объявления временно недоступны"
          description="Попробуйте открыть каталог или обновите страницу позже."
        />
        <ButtonLink href={href} variant="outline">
          Открыть каталог
        </ButtonLink>
      </div>
    );
  if (state.items.length === 0)
    return (
      <EmptyState
        title={
          type === 'VEHICLE'
            ? 'Новые автомобили появятся здесь'
            : 'Новые запчасти появятся здесь'
        }
        description="Сейчас в этом разделе нет опубликованных объявлений."
        action={
          <ButtonLink href="/sell" variant="outline">
            Разместить объявление
          </ButtonLink>
        }
      />
    );
  return (
    <ResultLayout>
      {state.items.map((listing) => (
        <MarketplaceResult
          key={listing.id}
          listing={listing}
          headingLevel={3}
        />
      ))}
    </ResultLayout>
  );
}
export async function LatestListings({
  origin,
  type,
}: {
  origin: string;
  type: SearchListingType;
}) {
  return (
    <LatestContent state={await loadLatestListings(origin, type)} type={type} />
  );
}
export function LatestLoading() {
  return <ResultLoading />;
}
