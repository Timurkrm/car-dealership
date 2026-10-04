import type { FavoriteItem } from '../engagement/engagement-client';
import { FavoriteButton } from '../engagement/favorite-button';
import { ResultCardShell, ResultPrice } from './result-card-shell';
import { ResultMedia } from './result-media';
import { resultMileage, partConditionLabel } from './result-format';
import { Badge } from '../../components/ui/badge';
export function FavoriteResult({
  item,
  onRemoved,
}: {
  item: FavoriteItem;
  onRemoved: () => void;
}) {
  if (item.kind === 'UNAVAILABLE')
    return (
      <article className="result-card result-card--unavailable">
        <h2>Объявление недоступно</h2>
        <p>
          Содержимое скрыто, потому что объявление больше не является публичным.
        </p>
        <FavoriteButton
          listingId={item.listingId}
          removeOnly
          onRemoved={onRemoved}
        />
      </article>
    );
  const condition = item.part ? partConditionLabel(item.part.condition) : null;
  return (
    <ResultCardShell
      id={item.listingId}
      title={item.title}
      href={`${item.kind === 'PART' ? '/parts' : '/listings'}/${item.listingId}`}
      media={
        <ResultMedia type={item.kind} cover={item.cover} label={item.title} />
      }
      price={<ResultPrice price={item.price} unit={item.kind === 'PART'} />}
      favorite={
        <FavoriteButton
          listingId={item.listingId}
          variant="icon"
          removeOnly
          onRemoved={onRemoved}
        />
      }
      status={
        item.availability === 'SOLD' ? (
          <Badge tone="neutral">Продано</Badge>
        ) : undefined
      }
    >
      {item.kind === 'VEHICLE' && item.vehicle && (
        <p>
          {item.vehicle.year} · {resultMileage(item.vehicle.mileageKm)}
        </p>
      )}
      {item.kind === 'PART' && item.part && (
        <>
          <p>{item.part.category.name}</p>
          {condition && <Badge tone="neutral">{condition}</Badge>}
        </>
      )}
    </ResultCardShell>
  );
}
