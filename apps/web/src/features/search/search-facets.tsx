'use client';
import { useCallback, useState } from 'react';
import type { SearchClient } from './search-client';
import type { SearchListingType } from './search-client';
import type { SearchParameters } from './search-parameters';
import { useListingResource } from '../listings/listing-resource';
import { Button } from '../../components/ui/button';
import { Alert } from '../../components/ui/feedback';
import { searchErrorMessage } from './search-presentation';

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
    <details className="search-facets">
      <summary>Варианты по фильтрам</summary>
      <p className="ui-field-hint">
        Количество после применения всех текущих фильтров.
      </p>
      <Button
        variant="ghost"
        disabled={requested > 0 && (result.loading || Boolean(result.value))}
        onClick={() => setRequested((value) => value + 1)}
      >
        Посчитать варианты по фильтрам
      </Button>
      {requested > 0 && result.loading && (
        <p role="status">Считаем варианты…</p>
      )}
      {Boolean(result.error) && (
        <Alert tone="error">{searchErrorMessage(result.error)}</Alert>
      )}
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
                    `${labels?.get(row.value) ?? 'Другой вариант'}: ${row.count}`,
                )
                .join(', ') || 'нет вариантов'}
            </p>
          ))}
          {result.value.truncated && (
            <p>Показаны наиболее частые варианты; полный набор ограничен.</p>
          )}
        </>
      )}
    </details>
  );
}
