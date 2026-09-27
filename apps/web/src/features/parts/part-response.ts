import { parsePhotos } from '../media/media-client';
import {
  base,
  catalogItem,
  id,
  integer,
  invalid,
  location,
  nullableText,
  object,
  point,
  text,
} from '../listings/listing-response';
import { PART_CONDITIONS } from '../listings/listing-types';
import type {
  PartCategory,
  PartSummary,
  PartDetail,
  OwnerPartListing,
  OwnerPartSummary,
  PublicPartListing,
  PublicPartSummary,
} from '../listings/listing-types';
export function parseCategory(value: unknown): PartCategory {
  const row = object(value);
  return {
    ...catalogItem(row),
    parentId: row.parentId === null ? null : id(row.parentId),
  };
}
function mode(value: unknown) {
  if (value === 'UNIVERSAL' || value === 'VEHICLE_SPECIFIC') return value;
  return invalid();
}
function attributes(value: unknown): Omit<PartSummary, 'fitment'> {
  const row = object(value);
  const condition = PART_CONDITIONS.find((item) => item === row.condition);
  if (!condition) return invalid();
  return {
    name: text(row.name),
    category: parseCategory(row.category),
    brand: row.brand === null ? null : catalogItem(row.brand),
    condition,
    quantityAvailable: integer(row.quantityAvailable, 0, 1000000),
  };
}
function summary(value: unknown): PartSummary {
  const row = object(value);
  const fitment = object(row.fitment);
  return {
    ...attributes(row),
    fitment: { mode: mode(fitment.mode), count: integer(fitment.count, 0, 50) },
  };
}
function detail(value: unknown): PartDetail {
  const row = object(value);
  if (!Array.isArray(row.fitments) || row.fitments.length > 50)
    return invalid();
  const fitmentMode = mode(row.fitmentMode);
  if (fitmentMode === 'UNIVERSAL' && row.fitments.length) return invalid();
  return {
    ...attributes(row),
    manufacturerPartNumber: nullableText(row.manufacturerPartNumber),
    oemNumber: nullableText(row.oemNumber),
    fitmentMode,
    fitments: row.fitments.map((value) => {
      const fit = object(value);
      const yearFrom =
        fit.yearFrom === null ? null : integer(fit.yearFrom, 1886, 2100);
      const yearTo =
        fit.yearTo === null ? null : integer(fit.yearTo, 1886, 2100);
      if (yearFrom !== null && yearTo !== null && yearFrom > yearTo)
        return invalid();
      return {
        make: catalogItem(fit.make),
        model: catalogItem(fit.model),
        generation:
          fit.generation === null ? null : catalogItem(fit.generation),
        yearFrom,
        yearTo,
      };
    }),
  };
}
function ownerFields(value: unknown) {
  const row = object(value);
  if (row.type !== 'PART') return invalid();
  return {
    ...base(row),
    type: 'PART' as const,
    location: location(row.location),
    version: integer(row.version, 1),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    submittedAt: nullableText(row.submittedAt),
    archivedAt: nullableText(row.archivedAt),
  };
}
export function parsePartOwnerSummary(value: unknown): OwnerPartSummary {
  const row = object(value);
  return { ...ownerFields(row), part: summary(row.part) };
}
export function parsePartOwner(value: unknown): OwnerPartListing {
  const row = object(value);
  const fields = ownerFields(row);
  return {
    ...fields,
    part: detail(row.part),
    description: nullableText(row.description),
    media: parsePhotos(row.media),
    location: fields.location
      ? {
          ...fields.location,
          exactPoint: point(object(row.location).exactPoint),
        }
      : null,
  };
}
function publicFields(value: unknown) {
  const row = object(value);
  const fields = base(row);
  if (
    row.type !== 'PART' ||
    (fields.status !== 'PUBLISHED' && fields.status !== 'SOLD')
  )
    return invalid();
  return {
    ...fields,
    type: 'PART' as const,
    location: location(row.location),
    seller: {
      id: id(object(row.seller).id),
      displayName: text(object(row.seller).displayName),
    },
  };
}
export function parsePartPublicSummary(value: unknown): PublicPartSummary {
  const row = object(value);
  return { ...publicFields(row), part: summary(row.part) };
}
export function parsePartPublic(value: unknown): PublicPartListing {
  const row = object(value);
  return {
    ...publicFields(row),
    part: detail(row.part),
    description: nullableText(row.description),
    media: parsePhotos(row.media),
  };
}
