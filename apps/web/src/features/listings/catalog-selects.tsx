'use client';
import { useCallback } from 'react';
import type { ListingApi } from './listing-api';
import type { CatalogSelection } from './listing-form-model';
import { selectMake, selectModel } from './listing-form-model';
import { useListingResource } from './listing-resource';
import { ListingError } from './listing-feedback';

export function CatalogSelects({
  api,
  selection,
  onChange,
  onLabelChange,
  required = true,
  showGeneration = true,
}: {
  api: ListingApi;
  selection: CatalogSelection;
  onChange: (next: CatalogSelection) => void;
  onLabelChange?: (label: string) => void;
  required?: boolean;
  showGeneration?: boolean;
}) {
  const makes = useListingResource(
    useCallback(
      (signal: AbortSignal) => api.catalog('makes', undefined, signal),
      [api],
    ),
  );
  const models = useListingResource(
    useCallback(
      (signal: AbortSignal) =>
        selection.makeId
          ? api.catalog('models', selection.makeId, signal)
          : Promise.resolve([]),
      [api, selection.makeId],
    ),
  );
  const generations = useListingResource(
    useCallback(
      (signal: AbortSignal) =>
        showGeneration && selection.modelId
          ? api.catalog('generations', selection.modelId, signal)
          : Promise.resolve([]),
      [api, selection.modelId, showGeneration],
    ),
  );
  function change(next: CatalogSelection) {
    onChange(next);
    onLabelChange?.(
      [
        makes.value?.find((row) => row.id === next.makeId)?.name,
        models.value?.find((row) => row.id === next.modelId)?.name,
        generations.value?.find((row) => row.id === next.generationId)?.name ??
          'все поколения',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
  return (
    <>
      <label>
        Марка
        <select
          required={required}
          value={selection.makeId}
          disabled={makes.loading || Boolean(makes.error)}
          onChange={(event) =>
            change(selectMake(selection, event.target.value))
          }
        >
          <option value="">
            {makes.loading ? 'Загрузка марок…' : 'Выберите марку'}
          </option>
          {makes.value?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Модель
        <select
          required={required}
          value={selection.modelId}
          disabled={
            !selection.makeId || models.loading || Boolean(models.error)
          }
          onChange={(event) =>
            change(selectModel(selection, event.target.value))
          }
        >
          <option value="">
            {models.loading && selection.makeId
              ? 'Загрузка моделей…'
              : 'Выберите модель'}
          </option>
          {models.value?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {showGeneration && (
        <label>
          Поколение (необязательно)
          <select
            value={selection.generationId}
            disabled={
              !selection.modelId ||
              generations.loading ||
              Boolean(generations.error)
            }
            onChange={(event) =>
              change({ ...selection, generationId: event.target.value })
            }
          >
            <option value="">
              {generations.loading && selection.modelId
                ? 'Загрузка поколений…'
                : 'Не указано'}
            </option>
            {generations.value?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ListingError error={makes.error || models.error || generations.error} />
      {(makes.error || models.error || generations.error) && (
        <p>Обновите страницу, чтобы повторить загрузку каталога.</p>
      )}
    </>
  );
}
