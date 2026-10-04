import type { PartSearchItem } from '../search/search-client';
import type { ResultInteractionProps } from './result-interaction';
import {
  ResultCardShell,
  ResultPrice,
  ResultLocation,
} from './result-card-shell';
import { ResultMedia } from './result-media';
import { partConditionLabel, compatibilitySummary } from './result-format';
import { Badge } from '../../components/ui/badge';
import { FavoriteButton } from '../engagement/favorite-button';
export function PartCard({
  listing,
  ...props
}: ResultInteractionProps & { listing: PartSearchItem }) {
  const part = listing.part;
  const condition = partConditionLabel(part.condition);
  const compatibility = compatibilitySummary(part.fitment);
  return (
    <ResultCardShell
      {...props}
      id={listing.id}
      title={listing.title}
      href={`/parts/${listing.id}`}
      media={
        <ResultMedia type="PART" cover={listing.cover} label={part.name} />
      }
      favorite={<FavoriteButton listingId={listing.id} variant="icon" />}
      price={<ResultPrice price={listing.price} unit />}
      location={<ResultLocation location={listing.location} />}
    >
      <div className="result-part-brand">
        {part.brand && <span>{part.brand.name}</span>}
        {condition && (
          <Badge tone={part.condition === 'NEW' ? 'success' : 'neutral'}>
            {condition}
          </Badge>
        )}
      </div>
      {(part.oemNumber || part.manufacturerPartNumber) && (
        <dl className="result-numbers">
          {part.oemNumber && (
            <>
              <dt>OEM</dt>
              <dd>{part.oemNumber}</dd>
            </>
          )}
          {part.manufacturerPartNumber && (
            <>
              <dt>Артикул производителя</dt>
              <dd>{part.manufacturerPartNumber}</dd>
            </>
          )}
        </dl>
      )}
      {compatibility && (
        <p className="result-compatibility">
          {compatibility}
          <span>По данным продавца</span>
        </p>
      )}
      <p>В наличии: {part.quantityAvailable.toLocaleString('ru-RU')} шт.</p>
    </ResultCardShell>
  );
}
