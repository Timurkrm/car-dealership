import { AuthApiError } from '../auth/auth-client';
import { STATUSES } from './listing-types';
import { parseVariant } from '../media/media-client';
import type {
  CatalogItem,
  Generation,
  Point,
  PublicLocation,
  ListingBase,
  Page,
} from './listing-types';
export function invalid(): never {
  throw new AuthApiError(502, 'INVALID_API_RESPONSE');
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid();
  return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}
export function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
export function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : invalid();
}
export function integer(value: unknown, min = 0, max = 2147483647): number {
  const result = number(value);
  return Number.isInteger(result) && result >= min && result <= max
    ? result
    : invalid();
}
export function nullableNumber(value: unknown): number | null {
  return value === null ? null : integer(value, 1);
}
export function id(value: unknown): string {
  const result = text(value);
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    result,
  )
    ? result
    : invalid();
}
export function catalogItem(value: unknown): CatalogItem {
  const row = object(value);
  return { id: id(row.id), name: text(row.name) };
}
export function generation(value: unknown): Generation {
  const row = object(value);
  return {
    ...catalogItem(row),
    startYear: integer(row.startYear, 1886, 2100),
    endYear: row.endYear === null ? null : integer(row.endYear, 1886, 2100),
  };
}
export function point(value: unknown): Point {
  const row = object(value);
  const latitude = number(row.latitude);
  const longitude = number(row.longitude);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    return invalid();
  return { latitude, longitude };
}
export function location(value: unknown): PublicLocation | null {
  if (value === null) return null;
  const row = object(value);
  return {
    city: text(row.city),
    region: nullableText(row.region),
    countryCode: text(row.countryCode),
    publicPoint: row.publicPoint === null ? null : point(row.publicPoint),
  };
}
export function base(value: unknown): Omit<ListingBase, 'description'> {
  const row = object(value);
  const price = object(row.price);
  const status = STATUSES.find((item) => item === row.status);
  if (!status) return invalid();
  const amountMinor = text(price.amountMinor);
  if (!/^(0|[1-9][0-9]{0,18})$/.test(amountMinor)) return invalid();
  return {
    id: id(row.id),
    title: text(row.title),
    cover: row.cover == null ? null : parseVariant(row.cover),
    price: { amountMinor, currency: text(price.currency) },
    status,
    publishedAt: nullableText(row.publishedAt),
    soldAt: nullableText(row.soldAt),
  };
}
export function page<T>(value: unknown, parse: (value: unknown) => T): Page<T> {
  const row = object(value);
  if (
    !Array.isArray(row.items) ||
    row.items.length > 50 ||
    typeof row.hasMore !== 'boolean'
  )
    return invalid();
  return {
    items: row.items.map(parse),
    limit: integer(row.limit, 1, 50),
    offset: integer(row.offset, 0, 10000),
    hasMore: row.hasMore,
  };
}
