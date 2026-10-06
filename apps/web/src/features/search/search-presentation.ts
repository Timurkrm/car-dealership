import type {
  SearchParameters,
  PrivateSearchOrigin,
} from './search-parameters';
import type { SearchListingType } from './search-client';
import { VEHICLE_OPTION_LABELS } from '../listings/vehicle-labels';
import { PART_CONDITION_LABELS } from '../parts/part-labels';
import { decimalFromMinor } from '../listings/listing-form-model';

export const FILTER_LABELS: Record<string, string> = {
  makeId: 'Марка',
  modelId: 'Модель',
  generationId: 'Поколение',
  compatibleMakeId: 'Марка',
  compatibleModelId: 'Модель',
  compatibleGenerationId: 'Поколение',
  categoryId: 'Категория',
  brandId: 'Бренд',
  compatibleYear: 'Год совместимости',
  bodyType: 'Кузов',
  fuelType: 'Топливо',
  transmission: 'Коробка передач',
  driveType: 'Привод',
  condition: 'Состояние',
  color: 'Цвет',
  partNumber: 'Номер детали',
  oemNumber: 'OEM',
  manufacturerPartNumber: 'Артикул производителя',
};
export const FITMENT_LABELS: Record<string, string> = {
  UNIVERSAL: 'Универсальные',
  VEHICLE_SPECIFIC: 'Для выбранных автомобилей',
};
/** Removes dependencies only where retaining them would be invalid or misleading. */
export function removeSearchFilter(
  filters: SearchParameters,
  key: string,
  value?: string,
): SearchParameters {
  const next = { ...filters };
  if (value) {
    const remaining = next[key]?.split(',').filter((item) => item !== value);
    if (remaining?.length) next[key] = remaining.join(',');
    else delete next[key];
  } else delete next[key];
  const children: Record<string, string[]> = {
    makeId: ['modelId', 'generationId'],
    modelId: ['generationId'],
    compatibleMakeId: ['compatibleModelId', 'compatibleGenerationId'],
    compatibleModelId: ['compatibleGenerationId'],
    year: ['yearFrom', 'yearTo'],
    mileage: ['mileageFrom', 'mileageTo'],
    price: ['priceFromMinor', 'priceToMinor'],
    currency: ['priceFromMinor', 'priceToMinor'],
    geo: ['lat', 'lng', 'radiusMeters', 'bbox'],
  };
  for (const child of children[key] ?? []) delete next[child];
  if (
    (key === 'geo' && next.sort === 'distance') ||
    (key === 'currency' && next.sort?.startsWith('price_'))
  )
    delete next.sort;
  return next;
}
export function publicSearchInput(
  filters: SearchParameters,
  privateOrigin: boolean,
): { filters: SearchParameters; origin?: PrivateSearchOrigin } {
  if (!privateOrigin || !filters.lat || !filters.lng) return { filters };
  const origin: PrivateSearchOrigin = {
    lat: filters.lat,
    lng: filters.lng,
    ...(filters.radiusMeters ? { radiusMeters: filters.radiusMeters } : {}),
    ...(filters.sort === 'distance' ? { sort: 'distance' } : {}),
  };
  const publicFilters = { ...filters };
  for (const key of ['lat', 'lng', 'radiusMeters']) delete publicFilters[key];
  if (publicFilters.sort === 'distance') delete publicFilters.sort;
  return { filters: publicFilters, origin };
}
export function activeSearchFilters(
  type: SearchListingType,
  filters: SearchParameters,
  labels: ReadonlyMap<string, string>,
  privateOrigin: boolean,
) {
  const chips: { key: string; value?: string; label: string }[] = [];
  const skip = new Set([
    'sort',
    'lat',
    'lng',
    'radiusMeters',
    'bbox',
    'yearFrom',
    'yearTo',
    'mileageFrom',
    'mileageTo',
    'priceFromMinor',
    'priceToMinor',
  ]);
  for (const [key, value] of Object.entries(filters)) {
    if (skip.has(key) || value === '') continue;
    if (key === 'includeSubcategories' || key === 'includeUniversal') {
      if (value === 'false')
        chips.push({
          key,
          label:
            key === 'includeSubcategories'
              ? 'Без подкатегорий'
              : 'Без универсальных',
        });
      continue;
    }
    if (key.endsWith('Id')) {
      chips.push({
        key,
        label: `${FILTER_LABELS[key]}: ${labels.get(value) ?? 'выбрано'}`,
      });
      continue;
    }
    if (key === 'currency') {
      chips.push({ key, label: value });
      continue;
    }
    for (const item of value.split(',')) {
      const human =
        key === 'fitmentMode'
          ? FITMENT_LABELS[item]
          : type === 'PART' && key === 'condition'
            ? PART_CONDITION_LABELS[item as keyof typeof PART_CONDITION_LABELS]
            : VEHICLE_OPTION_LABELS[item];
      chips.push({
        key,
        value: item,
        label: human ?? `${FILTER_LABELS[key] ?? key}: ${item}`,
      });
    }
  }
  for (const [key, from, to, label] of [
    ['year', 'yearFrom', 'yearTo', 'Год'],
    ['mileage', 'mileageFrom', 'mileageTo', 'Пробег, км'],
    ['price', 'priceFromMinor', 'priceToMinor', 'Цена'],
  ] as const) {
    const display = (value: string) =>
      key === 'price'
        ? `${decimalFromMinor(value, filters.currency!)} ${filters.currency}`
        : value;
    if (filters[from] || filters[to])
      chips.push({
        key,
        label: `${label}: ${filters[from] ? 'от ' + display(filters[from]) : ''}${filters[from] && filters[to] ? ' ' : ''}${filters[to] ? 'до ' + display(filters[to]) : ''}`,
      });
  }
  if (filters.bbox || filters.lat)
    chips.push({
      key: 'geo',
      label: privateOrigin
        ? 'Рядом со мной'
        : filters.bbox
          ? 'Область на карте'
          : 'Поиск рядом',
    });
  return chips;
}

export function searchErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error &&
    'status' in error &&
    error.status === 429
  )
    return 'Слишком много запросов. Подождите немного и повторите поиск.';
  return 'Не удалось загрузить результаты. Попробуйте ещё раз.';
}
