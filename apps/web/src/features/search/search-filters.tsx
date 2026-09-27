'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { CatalogSelects } from '../listings/catalog-selects';
import type { ListingApi } from '../listings/listing-api';
import { CURRENCIES, SPEC_OPTIONS } from '../listings/listing-types';
import { decimalFromMinor } from '../listings/listing-form-model';
import {
  SORT_LABELS,
  changeCatalog,
  filterFormParameters,
  requestSearchOrigin,
} from './search-parameters';
import type { SearchParameters } from './search-parameters';
import type { PrivateSearchOrigin } from './search-parameters';

const LABELS = {
  bodyType: 'Кузов',
  fuelType: 'Топливо',
  transmission: 'Коробка передач',
  driveType: 'Привод',
  condition: 'Состояние',
  color: 'Цвет',
};
export function SearchFilters({
  api,
  parameters,
  privateOriginActive = false,
  onApply,
}: {
  api: ListingApi;
  parameters: SearchParameters;
  privateOriginActive?: boolean;
  onApply: (next: SearchParameters, origin?: PrivateSearchOrigin) => void;
}) {
  const [draft, setDraft] = useState(parameters);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [browserOrigin, setBrowserOrigin] = useState(privateOriginActive);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const next = filterFormParameters(
        new FormData(event.currentTarget),
        draft,
      );
      setError(null);
      if (browserOrigin && next.lat && next.lng) {
        const publicFilters = { ...next };
        delete publicFilters.lat;
        delete publicFilters.lng;
        delete publicFilters.radiusMeters;
        if (publicFilters.sort === 'distance') delete publicFilters.sort;
        onApply(publicFilters, {
          lat: next.lat,
          lng: next.lng,
          ...(next.radiusMeters ? { radiusMeters: next.radiusMeters } : {}),
          ...(next.sort === 'distance' ? { sort: 'distance' as const } : {}),
        });
      } else onApply(next);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Проверьте фильтры.');
    }
  };
  const nearMe = async () => {
    setLocating(true);
    setError(null);
    try {
      const origin = await requestSearchOrigin(navigator.geolocation);
      setBrowserOrigin(true);
      setDraft((current) => {
        const next: SearchParameters = {
          ...current,
          ...origin,
          radiusMeters: current.radiusMeters ?? '50000',
        };
        delete next.bbox;
        return next;
      });
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : 'Геолокация недоступна.',
      );
    } finally {
      setLocating(false);
    }
  };
  return (
    <details className="search-filter-panel" open>
      <summary>Фильтры и порядок выдачи</summary>
      <form onSubmit={submit} className="listing-form">
        <fieldset className="form-grid">
          <legend>Автомобиль</legend>
          <CatalogSelects
            api={api}
            required={false}
            selection={{
              makeId: draft.makeId ?? '',
              modelId: draft.modelId ?? '',
              generationId: draft.generationId ?? '',
            }}
            onChange={(next) =>
              setDraft((current) => {
                if (next.makeId !== (current.makeId ?? ''))
                  return changeCatalog(current, 'makeId', next.makeId);
                if (next.modelId !== (current.modelId ?? ''))
                  return changeCatalog(current, 'modelId', next.modelId);
                return { ...current, generationId: next.generationId };
              })
            }
          />
          <label>
            Год от
            <input
              name="yearFrom"
              type="number"
              min={1886}
              max={2100}
              step={1}
              defaultValue={parameters.yearFrom ?? ''}
            />
          </label>
          <label>
            Год до
            <input
              name="yearTo"
              type="number"
              min={1886}
              max={2100}
              step={1}
              defaultValue={parameters.yearTo ?? ''}
            />
          </label>
          <label>
            Пробег от, км
            <input
              name="mileageFrom"
              type="number"
              min={0}
              max={2147483647}
              step={1}
              defaultValue={parameters.mileageFrom ?? ''}
            />
          </label>
          <label>
            Пробег до, км
            <input
              name="mileageTo"
              type="number"
              min={0}
              max={2147483647}
              step={1}
              defaultValue={parameters.mileageTo ?? ''}
            />
          </label>
        </fieldset>
        <fieldset className="form-grid">
          <legend>Цена</legend>
          <label>
            Валюта
            <select name="currency" defaultValue={parameters.currency ?? ''}>
              <option value="">Любая</option>
              {CURRENCIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Цена от
            <input
              name="priceFrom"
              inputMode="decimal"
              defaultValue={
                parameters.priceFromMinor !== undefined && parameters.currency
                  ? decimalFromMinor(
                      parameters.priceFromMinor,
                      parameters.currency,
                    )
                  : ''
              }
            />
          </label>
          <label>
            Цена до
            <input
              name="priceTo"
              inputMode="decimal"
              defaultValue={
                parameters.priceToMinor !== undefined && parameters.currency
                  ? decimalFromMinor(
                      parameters.priceToMinor,
                      parameters.currency,
                    )
                  : ''
              }
            />
          </label>
        </fieldset>
        <fieldset className="form-grid">
          <legend>Характеристики</legend>
          {Object.entries(SPEC_OPTIONS).map(([key, values]) => (
            <label key={key}>
              {LABELS[key as keyof typeof LABELS]}
              <select
                name={key}
                multiple
                size={3}
                defaultValue={parameters[key]?.split(',') ?? []}
              >
                {values.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
          <p>Без выбора — любые значения. Можно выбрать несколько вариантов.</p>
        </fieldset>
        <fieldset className="form-grid">
          <legend>Местоположение</legend>
          <button
            type="button"
            disabled={locating}
            onClick={() => {
              void nearMe();
            }}
          >
            {locating ? 'Определяем местоположение…' : 'Рядом со мной'}
          </button>
          <p>
            Геолокация запрашивается только по нажатию и не добавляется в URL
            или постоянное хранилище.
          </p>
          {draft.bbox && (
            <p>
              Задана область поиска.{' '}
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    const next = { ...current };
                    delete next.bbox;
                    return next;
                  })
                }
              >
                Убрать область
              </button>
            </p>
          )}
          <input type="hidden" name="bbox" value={draft.bbox ?? ''} />
          <label>
            Широта
            <input
              name="lat"
              type="number"
              min={-90}
              max={90}
              step="any"
              value={draft.lat ?? ''}
              onChange={(event) => {
                setBrowserOrigin(false);
                setDraft({ ...draft, lat: event.target.value });
              }}
            />
          </label>
          <label>
            Долгота
            <input
              name="lng"
              type="number"
              min={-180}
              max={180}
              step="any"
              value={draft.lng ?? ''}
              onChange={(event) => {
                setBrowserOrigin(false);
                setDraft({ ...draft, lng: event.target.value });
              }}
            />
          </label>
          <label>
            Радиус, км
            <input
              type="number"
              min={0.001}
              max={250}
              step={0.001}
              value={
                draft.radiusMeters ? Number(draft.radiusMeters) / 1000 : ''
              }
              onChange={(event) =>
                setDraft({
                  ...draft,
                  radiusMeters: event.target.value
                    ? String(Math.round(Number(event.target.value) * 1000))
                    : '',
                })
              }
            />
          </label>
          <input
            type="hidden"
            name="radiusMeters"
            value={draft.radiusMeters ?? ''}
          />
          <button
            type="button"
            onClick={() => {
              setBrowserOrigin(false);
              setDraft((current) => {
                const next = { ...current };
                delete next.lat;
                delete next.lng;
                delete next.radiusMeters;
                if (next.sort === 'distance') delete next.sort;
                return next;
              });
            }}
          >
            Убрать местоположение
          </button>
        </fieldset>
        <label>
          Порядок выдачи
          <select
            name="sort"
            value={draft.sort ?? 'newest'}
            onChange={(event) =>
              setDraft({ ...draft, sort: event.target.value })
            }
          >
            {Object.entries(SORT_LABELS)
              .filter(
                ([value]) => value !== 'distance' || (draft.lat && draft.lng),
              )
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="listing-actions">
          <button type="submit" disabled={locating}>
            Применить фильтры
          </button>
          <button type="button" onClick={() => onApply({})}>
            Сбросить фильтры
          </button>
        </div>
      </form>
    </details>
  );
}
