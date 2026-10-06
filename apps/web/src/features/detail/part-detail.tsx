import type { PartDetail as Part, PublicPartListing } from '../listings/listing-types';
import { PART_CONDITION_LABELS } from '../parts/part-labels';
import { Section } from '../../components/ui/layout';
import { Badge } from '../../components/ui/badge';
import { DetailShell } from './detail-shell';
import { DetailFacts } from './detail-facts';
import { fitmentYears, groupedFitments } from './detail-model';

export function PartFacts({ part }: { part: Part }) {
  return <DetailFacts compact rows={[
    ['Категория', part.category.name], ['Бренд', part.brand?.name],
    ['Состояние', <Badge key="condition" tone={part.condition === 'NEW' ? 'success' : 'neutral'}>{PART_CONDITION_LABELS[part.condition]}</Badge>],
    ['В наличии', `${part.quantityAvailable.toLocaleString('ru-RU')} шт.`],
  ]} />;
}
export function PartNumbers({ part }: { part: Part }) {
  if (!part.oemNumber && !part.manufacturerPartNumber) return null;
  return <Section className="detail-section" aria-labelledby="part-numbers"><h2 id="part-numbers">Номера детали</h2><DetailFacts rows={[
    ['Номер OEM', part.oemNumber], ['Номер производителя', part.manufacturerPartNumber],
  ]} /></Section>;
}
export function PartCompatibility({ part }: { part: Part }) {
  const groups = groupedFitments(part.fitments);
  return <Section className="detail-section" aria-labelledby="part-compatibility"><h2 id="part-compatibility">Совместимость</h2>
    <p className="ui-metadata">Указана продавцом; проверьте номер и применимость перед покупкой.</p>
    {part.fitmentMode === 'UNIVERSAL' ? <p className="detail-universal"><Badge tone="info">Универсальная запчасть</Badge></p> : groups.length === 0 ? <p>Информация о совместимости недоступна. Уточните её у продавца.</p> :
      <div className="detail-fitments">{groups.map(make => <section key={make.id}><h3>{make.name}</h3><ul>{make.models.map(model => <li key={model.id}><strong>{model.name}</strong><ul>{model.scopes.map((scope, index) => <li key={index}>{scope.generation?.name ?? 'Все поколения'} · {fitmentYears(scope)}</li>)}</ul></li>)}</ul></section>)}</div>}
  </Section>;
}
export function PartDetail({ listing, sellerIdentity }: { listing: PublicPartListing; sellerIdentity: string }) {
  return <DetailShell listing={listing} sellerIdentity={sellerIdentity} facts={<PartFacts part={listing.part} />}><PartNumbers part={listing.part} /><PartCompatibility part={listing.part} /></DetailShell>;
}
