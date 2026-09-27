'use client';
import { useCallback, useState } from 'react';
import type { SearchClient } from './search-client';
import type { SearchListingType } from './search-client';
import type { SearchParameters } from './search-parameters';
import { useListingResource } from '../listings/listing-resource';
import { ListingError } from '../listings/listing-feedback';

/** Explicit opt-in avoids making exact aggregation part of every catalogue request. */
export function SearchFacetSummary({
  api,
  type,
  parameters,
  labels,
}: {
  api: SearchClient;
  type: SearchListingType;
  parameters: SearchParameters;
  labels?: ReadonlyMap<string, string>;
}) {
  const [requested, setRequested] = useState(0);
  const result = useListingResource(
    useCallback(
      (signal: AbortSignal) =>
        requested
          ? api.facets(type, parameters, signal)
          : Promise.resolve(null),
      [api, parameters, requested, type],
    ),
  );
  return (
    <aside aria-label="Число вариантов по текущим фильтрам">
      <button
        disabled={requested > 0 && result.loading}
        onClick={() => setRequested((value) => value + 1)}
      >
        Посчитать варианты по фильтрам
      </button>
      {requested > 0 && result.loading && (
        <p role="status">Считаем варианты…</p>
      )}
      <ListingError error={result.error} />
      {result.value && (
        <>
          {(type === 'VEHICLE'
            ? ['make', 'bodyType', 'fuelType', 'transmission']
            : ['category', 'brand', 'condition']
          ).map((key) => (
            <p key={key}>
              {
                {
                  make: 'Марка',
                  bodyType: 'Кузов',
                  fuelType: 'Топливо',
                  transmission: 'Коробка',
                  category: 'Категория',
                  brand: 'Бренд',
                  condition: 'Состояние',
                }[key]
              }
              :{' '}
              {result.value?.facets[key]
                ?.map(
                  (row) =>
                    `${labels?.get(row.value) ?? row.value}: ${row.count}`,
                )
                .join(', ') || 'нет вариантов'}
            </p>
          ))}
          {result.value.truncated && (
            <p>Показаны наиболее частые варианты; полный набор ограничен.</p>
          )}
        </>
      )}
    </aside>
  );
}
