import { CURRENCIES, SPEC_OPTIONS } from '../listings/listing-types';
import { minorFromDecimal } from '../listings/listing-form-model';

export const SORT_LABELS = {
  newest: 'Сначала новые',
  price_asc: 'Цена ↑',
  price_desc: 'Цена ↓',
  mileage_asc: 'Пробег',
  year_desc: 'Год',
  distance: 'Расстояние',
};
export type SearchParameters = Record<string, string>;
export interface PrivateSearchOrigin {
  lat: string;
  lng: string;
  radiusMeters?: string;
  sort?: 'distance';
}
const KEYS = [
  'makeId',
  'modelId',
  'generationId',
  'yearFrom',
  'yearTo',
  'priceFromMinor',
  'priceToMinor',
  'currency',
  'mileageFrom',
  'mileageTo',
  ...Object.keys(SPEC_OPTIONS),
  'sort',
  'bbox',
  'lat',
  'lng',
  'radiusMeters',
];
export function validateSearch(parameters: SearchParameters): string | null {
  for (const [key, value] of Object.entries(parameters)) {
    if (!KEYS.includes(key) || value.length > 256)
      return 'Некорректные параметры ссылки.';
    if (
      ['makeId', 'modelId', 'generationId'].includes(key) &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value,
      )
    )
      return 'Некорректная марка, модель или поколение.';
  }
  for (const key of ['yearFrom', 'yearTo', 'mileageFrom', 'mileageTo']) {
    const value = parameters[key];
    if (value === undefined) continue;
    const year = key.startsWith('year');
    if (
      !/^(0|[1-9]\d{0,9})$/.test(value) ||
      Number(value) < (year ? 1886 : 0) ||
      Number(value) > (year ? 2100 : 2147483647)
    )
      return 'Проверьте год и пробег.';
  }
  for (const key of ['priceFromMinor', 'priceToMinor']) {
    const value = parameters[key];
    if (
      value !== undefined &&
      (!/^(0|[1-9]\d{0,18})$/.test(value) ||
        BigInt(value) > 9223372036854775807n)
    )
      return 'Проверьте цену.';
  }
  for (const [from, to] of [
    ['yearFrom', 'yearTo'],
    ['mileageFrom', 'mileageTo'],
    ['priceFromMinor', 'priceToMinor'],
  ])
    if (
      from &&
      to &&
      parameters[from] !== undefined &&
      parameters[to] !== undefined &&
      BigInt(parameters[from]) > BigInt(parameters[to])
    )
      return 'Значение «от» должно быть не больше «до».';
  if (
    parameters.currency !== undefined &&
    !CURRENCIES.some((value) => value === parameters.currency)
  )
    return 'Выберите валюту.';
  const sort = parameters.sort ?? 'newest';
  if (!Object.keys(SORT_LABELS).includes(sort))
    return 'Выберите порядок выдачи.';
  if (
    (parameters.priceFromMinor !== undefined ||
      parameters.priceToMinor !== undefined ||
      sort.startsWith('price_')) &&
    !parameters.currency
  )
    return 'Для цены и сортировки по цене выберите валюту.';
  for (const [key, allowed] of Object.entries(SPEC_OPTIONS)) {
    const value = parameters[key];
    if (value === undefined) continue;
    const parts = value.split(',');
    if (
      parts.length > 8 ||
      new Set(parts).size !== parts.length ||
      !parts.every((part) => allowed.some((value) => value === part))
    )
      return 'Проверьте категории фильтров.';
  }
  const origin =
    parameters.lat !== undefined ||
    parameters.lng !== undefined ||
    parameters.radiusMeters !== undefined;
  if (origin && parameters.bbox !== undefined)
    return 'Выберите один географический фильтр.';
  const validCoordinate = (value: string | undefined, max: number) =>
    value !== undefined &&
    /^-?\d{1,3}(?:\.\d{1,8})?$/.test(value) &&
    Math.abs(Number(value)) <= max;
  if (
    origin &&
    (!validCoordinate(parameters.lat, 90) ||
      !validCoordinate(parameters.lng, 180))
  )
    return 'Проверьте широту и долготу.';
  if (
    parameters.radiusMeters !== undefined &&
    (!/^[1-9]\d{0,5}$/.test(parameters.radiusMeters) ||
      Number(parameters.radiusMeters) > 250000)
  )
    return 'Радиус должен быть от 1 м до 250 км.';
  if (parameters.bbox !== undefined) {
    const parts = parameters.bbox.split(',');
    if (
      parts.length !== 4 ||
      !validCoordinate(parts[0], 180) ||
      !validCoordinate(parts[1], 90) ||
      !validCoordinate(parts[2], 180) ||
      !validCoordinate(parts[3], 90) ||
      Number(parts[1]) > Number(parts[3])
    )
      return 'Некорректная область поиска.';
  }
  if (sort === 'distance' && !origin)
    return 'Для расстояния задайте местоположение.';
  return null;
}
export function parseSearchParameters(input: URLSearchParams): {
  parameters: SearchParameters;
  error: string | null;
} {
  const parameters: SearchParameters = {};
  for (const [key, value] of input) {
    if (parameters[key] !== undefined)
      return { parameters: {}, error: 'Повторяющиеся параметры ссылки.' };
    parameters[key] = value;
  }
  const error = validateSearch(parameters);
  return { parameters: error ? {} : parameters, error };
}
export function serializeSearchParameters(
  parameters: SearchParameters,
): string {
  const values = Object.entries(parameters)
    .filter(([, value]) => value !== '')
    .map(
      ([key, value]) =>
        [
          key,
          key in SPEC_OPTIONS ? value.split(',').sort().join(',') : value,
        ] as [string, string],
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(values).toString();
}
export function changeCatalog(
  parameters: SearchParameters,
  parent: 'makeId' | 'modelId',
  value: string,
): SearchParameters {
  const next = { ...parameters, [parent]: value };
  delete next.generationId;
  if (parent === 'makeId') delete next.modelId;
  return next;
}
export function filterFormParameters(
  data: FormData,
  selection: SearchParameters,
): SearchParameters {
  const result: SearchParameters = { ...selection };
  for (const key of KEYS) {
    if (
      [
        'makeId',
        'modelId',
        'generationId',
        'priceFromMinor',
        'priceToMinor',
      ].includes(key)
    )
      continue;
    const value =
      key in SPEC_OPTIONS
        ? data
            .getAll(key)
            .filter((value): value is string => typeof value === 'string')
            .join(',')
        : data.get(key);
    if (typeof value === 'string' && value.trim()) result[key] = value.trim();
    else delete result[key];
  }
  for (const [key, formKey] of [
    ['priceFromMinor', 'priceFrom'],
    ['priceToMinor', 'priceTo'],
  ]) {
    if (!key || !formKey) continue;
    const value = data.get(formKey);
    if (typeof value !== 'string' || !value.trim()) {
      delete result[key];
      continue;
    }
    if (!result.currency) throw new Error('Выберите валюту для цены.');
    try {
      result[key] = /^0(?:[.,]0{1,2})?$/.test(value.trim())
        ? '0'
        : minorFromDecimal(value, result.currency);
    } catch {
      throw new Error('Проверьте цену и валюту.');
    }
  }
  for (const [key, value] of Object.entries(result))
    if (!value) delete result[key];
  const error = validateSearch(result);
  if (error) throw new Error(error);
  return result;
}
export function formatSearchDistance(meters: number | null): string | null {
  return meters === null
    ? null
    : meters === 0
      ? '< 1 км'
      : `${(meters / 1000).toLocaleString('ru-RU')} км`;
}

export interface SearchGeolocation {
  getCurrentPosition(
    success: (position: {
      coords: { latitude: number; longitude: number };
    }) => void,
    error: (failure: { code: number }) => void,
    options: {
      timeout: number;
      maximumAge: number;
      enableHighAccuracy: boolean;
    },
  ): void;
}
/** Called only by explicit action; callers must keep browser coordinates in memory. */
export function requestSearchOrigin(
  geo: SearchGeolocation | undefined,
): Promise<{ lat: string; lng: string }> {
  return new Promise((resolve, reject) => {
    if (!geo) {
      reject(
        new Error('Геолокация недоступна. Можно задать координаты вручную.'),
      );
      return;
    }
    geo.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: coords.latitude.toFixed(6),
          lng: coords.longitude.toFixed(6),
        }),
      ({ code }) =>
        reject(
          new Error(
            code === 1
              ? 'Доступ к местоположению отклонён. Поиск доступен без него.'
              : 'Не удалось определить местоположение. Можно задать координаты вручную.',
          ),
        ),
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  });
}
