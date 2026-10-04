import { decimalFromMinor } from '../listings/listing-form-model';
import { formatSearchDistance } from '../search/search-parameters';
import { PART_CONDITION_LABELS } from '../parts/part-labels';
import type { PartSearchItem } from '../search/search-client';

export function resultPrice(amountMinor: string, currency: string) {
  const [whole, fraction] = decimalFromMinor(amountMinor, currency).split('.');
  return `${BigInt(whole!).toLocaleString('ru-RU')}${fraction && fraction !== '00' ? `,${fraction}` : ''}\u00a0${currency}`;
}
export const resultMileage = (value: number) =>
  `${value.toLocaleString('ru-RU')} км`;
export function partConditionLabel(value: string) {
  return Object.hasOwn(PART_CONDITION_LABELS, value)
    ? PART_CONDITION_LABELS[value as keyof typeof PART_CONDITION_LABELS]
    : null;
}
export function compatibilitySummary(
  fitment: PartSearchItem['part']['fitment'],
) {
  if (fitment.mode === 'UNIVERSAL') return 'Универсальная совместимость';
  const sample = fitment.samples[0];
  if (!sample)
    return fitment.count > 0
      ? `Вариантов совместимости: ${fitment.count}`
      : null;
  const years =
    sample.yearFrom !== null && sample.yearTo !== null
      ? `${sample.yearFrom}–${sample.yearTo}`
      : sample.yearFrom !== null
        ? `от ${sample.yearFrom}`
        : sample.yearTo !== null
          ? `до ${sample.yearTo}`
          : '';
  return `${sample.make.name} ${sample.model.name}${sample.generation ? ` ${sample.generation.name}` : ''}${years ? ` · ${years}` : ''}${fitment.count > 1 ? ` · ещё ${fitment.count - 1}` : ''}`;
}
export { formatSearchDistance };
