import { AuthApiError } from '../auth/auth-client';
import { CURRENCIES, PART_CONDITIONS } from '../listings/listing-types';
import type { SearchParameters } from '../search/search-parameters';
import { minorFromDecimal } from '../listings/listing-form-model';

export const PART_FILTER_KEYS = [
  'categoryId',
  'includeSubcategories',
  'brandId',
  'condition',
  'oemNumber',
  'manufacturerPartNumber',
  'partNumber',
  'compatibleMakeId',
  'compatibleModelId',
  'compatibleGenerationId',
  'compatibleYear',
  'fitmentMode',
  'includeUniversal',
  'currency',
  'priceFromMinor',
  'priceToMinor',
  'sort',
  'lat',
  'lng',
  'radiusMeters',
  'bbox',
] as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PART_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,99}$/;

/** Form adapter only; authoritative validation and number normalization stay unchanged. */
export function partFilterFormParameters(
  data: FormData,
  draft: SearchParameters,
): SearchParameters {
  const next: SearchParameters = {};
  for (const key of [
    'compatibleMakeId',
    'compatibleModelId',
    'compatibleGenerationId',
  ])
    if (draft[key]) next[key] = draft[key];
  for (const key of [
    'categoryId',
    'brandId',
    'partNumber',
    'oemNumber',
    'manufacturerPartNumber',
    'compatibleYear',
    'currency',
    'lat',
    'lng',
    'radiusMeters',
    'bbox',
    'sort',
  ]) {
    const value = data.get(key);
    if (typeof value === 'string' && value.trim()) next[key] = value.trim();
  }
  for (const key of ['condition', 'fitmentMode']) {
    const values = data
      .getAll(key)
      .filter((value): value is string => typeof value === 'string');
    if (values.length) next[key] = values.sort().join(',');
  }
  for (const key of ['includeUniversal', 'includeSubcategories'])
    next[key] = data.has(key) ? 'true' : 'false';
  for (const bound of ['From', 'To']) {
    const value = data.get(`price${bound}`);
    if (typeof value === 'string' && value.trim()) {
      if (!next.currency) throw new Error('Для цены выберите валюту.');
      next[`price${bound}Minor`] = /^0(?:[.,]0{1,2})?$/.test(value.trim())
        ? '0'
        : minorFromDecimal(value, next.currency);
    }
  }
  const error = validatePartSearch(next);
  if (error) throw new Error(error);
  return next;
}

function validCoordinate(value: string, max: number) {
  return (
    /^-?\d{1,3}(?:\.\d{1,8})?$/.test(value) && Math.abs(Number(value)) <= max
  );
}
export function validatePartSearch(
  parameters: SearchParameters,
): string | null {
  for (const [key, value] of Object.entries(parameters)) {
    if (
      !PART_FILTER_KEYS.some((allowed) => allowed === key) ||
      value.length > 256
    )
      return 'Некорректные параметры ссылки.';
    if (key.endsWith('Id') && !UUID.test(value))
      return 'Некорректный идентификатор каталога.';
  }
  if (parameters.compatibleGenerationId && !parameters.compatibleModelId)
    return 'Для поколения сначала выберите модель.';
  if (
    parameters.compatibleYear &&
    (!/^\d{4}$/.test(parameters.compatibleYear) ||
      Number(parameters.compatibleYear) < 1886 ||
      Number(parameters.compatibleYear) > 2100)
  )
    return 'Проверьте год совместимости.';
  for (const key of ['oemNumber', 'manufacturerPartNumber', 'partNumber']) {
    const value = parameters[key];
    if (value && !PART_NUMBER.test(value)) return 'Проверьте номер запчасти.';
  }
  if (parameters.condition) {
    const values = parameters.condition.split(',');
    if (
      values.length > 8 ||
      new Set(values).size !== values.length ||
      !values.every((value) => PART_CONDITIONS.some((row) => row === value))
    )
      return 'Проверьте состояние запчасти.';
  }
  if (parameters.fitmentMode) {
    const values = parameters.fitmentMode.split(',');
    if (
      values.length > 2 ||
      new Set(values).size !== values.length ||
      !values.every(
        (value) => value === 'UNIVERSAL' || value === 'VEHICLE_SPECIFIC',
      )
    )
      return 'Проверьте тип совместимости.';
  }
  for (const key of ['includeUniversal', 'includeSubcategories'])
    if (
      parameters[key] !== undefined &&
      parameters[key] !== 'true' &&
      parameters[key] !== 'false'
    )
      return 'Некорректный логический фильтр.';
  if (
    parameters.currency &&
    !CURRENCIES.some((row) => row === parameters.currency)
  )
    return 'Выберите валюту.';
  for (const key of ['priceFromMinor', 'priceToMinor']) {
    const value = parameters[key];
    if (
      value !== undefined &&
      (!/^(0|[1-9]\d{0,18})$/.test(value) ||
        BigInt(value) > 9223372036854775807n)
    )
      return 'Проверьте цену.';
  }
  const from = parameters.priceFromMinor;
  const to = parameters.priceToMinor;
  if (
    (from || to || parameters.sort?.startsWith('price_')) &&
    !parameters.currency
  )
    return 'Для цены выберите валюту.';
  if (from && to && BigInt(from) > BigInt(to))
    return 'Цена «от» должна быть не больше цены «до».';
  if (
    parameters.sort &&
    !['newest', 'price_asc', 'price_desc', 'distance'].includes(parameters.sort)
  )
    return 'Выберите порядок выдачи.';
  const origin =
    parameters.lat !== undefined ||
    parameters.lng !== undefined ||
    parameters.radiusMeters !== undefined;
  if (
    origin &&
    (!parameters.lat ||
      !validCoordinate(parameters.lat, 90) ||
      !parameters.lng ||
      !validCoordinate(parameters.lng, 180))
  )
    return 'Проверьте координаты.';
  if (
    parameters.radiusMeters &&
    (!/^[1-9]\d{0,5}$/.test(parameters.radiusMeters) ||
      Number(parameters.radiusMeters) > 250000)
  )
    return 'Радиус должен быть от 1 м до 250 км.';
  if (origin && parameters.bbox) return 'Выберите один географический фильтр.';
  if (parameters.bbox) {
    const values = parameters.bbox.split(',');
    if (
      values.length !== 4 ||
      !validCoordinate(values[0] ?? '', 180) ||
      !validCoordinate(values[1] ?? '', 90) ||
      !validCoordinate(values[2] ?? '', 180) ||
      !validCoordinate(values[3] ?? '', 90) ||
      Number(values[1]) > Number(values[3])
    )
      return 'Некорректная область поиска.';
  }
  if (parameters.sort === 'distance' && !origin)
    return 'Для сортировки по расстоянию укажите местоположение.';
  return null;
}
export function parsePartSearchParameters(input: URLSearchParams): {
  parameters: SearchParameters;
  error: string | null;
} {
  const parameters: SearchParameters = {};
  for (const [key, value] of input) {
    if (parameters[key] !== undefined)
      return { parameters: {}, error: 'Повторяющиеся параметры ссылки.' };
    parameters[key] = value;
  }
  const error = validatePartSearch(parameters);
  return { parameters: error ? {} : parameters, error };
}

/** Backward-compatible helper used by form tests; output is canonical and safe. */
export function parsePartFilters(input: URLSearchParams): URLSearchParams {
  const filtered = new URLSearchParams();
  for (const key of PART_FILTER_KEYS) {
    const value = input.get(key);
    if (value !== null) filtered.set(key, value);
  }
  const parsed = parsePartSearchParameters(filtered);
  return new URLSearchParams(
    Object.entries(parsed.parameters).sort(([a], [b]) => a.localeCompare(b)),
  );
}
export function validatePartFilterRange(query: URLSearchParams): void {
  const error = validatePartSearch(Object.fromEntries(query));
  if (error) throw new AuthApiError(400, 'SEARCH_INVALID_RANGE');
}
