import type { PartDetail } from '../listings/listing-types';
import { PART_CONDITION_LABELS } from './part-labels';
export function PartDetails({ part }: { part: PartDetail }) {
  return (
    <>
      <dl className="vehicle-details">
        <dt>Запчасть</dt>
        <dd>{part.name}</dd>
        <dt>Категория</dt>
        <dd>{part.category.name}</dd>
        <dt>Бренд</dt>
        <dd>{part.brand?.name ?? 'Не указан'}</dd>
        <dt>Состояние</dt>
        <dd>{PART_CONDITION_LABELS[part.condition]}</dd>
        <dt>Количество</dt>
        <dd>{part.quantityAvailable}</dd>
        <dt>OEM номер</dt>
        <dd>{part.oemNumber ?? 'Не указан'}</dd>
        <dt>Номер производителя</dt>
        <dd>{part.manufacturerPartNumber ?? 'Не указан'}</dd>
      </dl>
      <h2>Совместимость</h2>
      <p>Указана продавцом; проверьте номер и применимость перед покупкой.</p>
      {part.fitmentMode === 'UNIVERSAL' ? (
        <p>Универсальная запчасть</p>
      ) : (
        <ul>
          {part.fitments.map((row, index) => (
            <li key={index}>
              {row.make.name} {row.model.name},{' '}
              {row.generation?.name ?? 'все поколения'},{' '}
              {row.yearFrom ?? 'без нижней границы'} —{' '}
              {row.yearTo ?? 'без верхней границы'}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
