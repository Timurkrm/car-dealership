import type { SearchListingType } from './search-client';
import type { MouseEvent } from 'react';
import type { SearchParameters } from './search-parameters';
import { SORT_LABELS } from './search-parameters';
import type { MarketplaceView } from '../map/map-state';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/field';
export function SearchToolbar({
  type,
  parameters,
  loaded,
  loading,
  view,
  onView,
  onSort,
  mobile,
  openFilters,
  count,
}: {
  type: SearchListingType;
  parameters: SearchParameters;
  loaded: number;
  loading: boolean;
  view: MarketplaceView;
  onView: (view: MarketplaceView) => void;
  onSort: (sort: string) => void;
  mobile: boolean;
  openFilters: (event: MouseEvent<HTMLButtonElement>) => void;
  count: number;
}) {
  return (
    <div className="search-toolbar">
      <div className="search-result-context">
        <strong>Результаты поиска</strong>
        <span>{loading ? 'Обновляем…' : `Загружено: ${loaded}`}</span>
      </div>
      {mobile && (
        <Button variant="outline" onClick={openFilters} aria-haspopup="dialog">
          Фильтры{count ? ` · ${count}` : ''}
        </Button>
      )}
      <Select
        label="Порядок выдачи"
        value={parameters.sort ?? 'newest'}
        onChange={(event) => onSort(event.target.value)}
        hint={
          !parameters.currency
            ? 'Для сортировки по цене выберите валюту в фильтрах.'
            : undefined
        }
      >
        {Object.entries(SORT_LABELS)
          .filter(
            ([value]) =>
              (type === 'VEHICLE' ||
                !['mileage_asc', 'year_desc'].includes(value)) &&
              (value !== 'distance' || (parameters.lat && parameters.lng)),
          )
          .map(([value, label]) => (
            <option
              key={value}
              value={value}
              disabled={value.startsWith('price_') && !parameters.currency}
            >
              {label}
            </option>
          ))}
      </Select>
      <div
        className="search-view-control"
        role="group"
        aria-label="Режим каталога"
      >
        {(['list', 'split', 'map'] as const)
          .filter((mode) => !mobile || mode !== 'split')
          .map((mode) => (
            <Button
              key={mode}
              variant={view === mode ? 'primary' : 'ghost'}
              aria-pressed={view === mode}
              onClick={() => onView(mode)}
            >
              {mode === 'list'
                ? 'Список'
                : mode === 'map'
                  ? 'Карта'
                  : 'Список + карта'}
            </Button>
          ))}
      </div>
    </div>
  );
}
