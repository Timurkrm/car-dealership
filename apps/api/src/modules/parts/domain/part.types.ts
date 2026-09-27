import { ApiException } from '../../../platform/http/api-error';

export const PART_CONDITIONS = [
  'NEW',
  'USED',
  'REFURBISHED',
  'FOR_PARTS',
] as const;
export type PartCondition = (typeof PART_CONDITIONS)[number];
export const FITMENT_MODES = ['UNIVERSAL', 'VEHICLE_SPECIFIC'] as const;
export type FitmentMode = (typeof FITMENT_MODES)[number];
export interface FitmentSelection {
  modelId: string;
  generationId?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
}
export interface FitmentInput {
  mode: FitmentMode;
  vehicles: FitmentSelection[];
}
export function invalidPart(code: string): never {
  throw new ApiException(400, code, 'Invalid part information');
}
/** Keep separators: AB-12 and AB12 can denote different manufacturer identifiers. */
export function normalizePartNumber(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const normalized = value.trim().toUpperCase();
  if (
    !normalized ||
    normalized.length > 100 ||
    !/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(normalized)
  )
    return invalidPart('PART_INVALID_NUMBER');
  return normalized;
}
export function validateFitment(input: FitmentInput): void {
  if (
    !FITMENT_MODES.includes(input.mode) ||
    !Array.isArray(input.vehicles) ||
    input.vehicles.length > 50
  )
    return invalidPart('PART_INVALID_FITMENT');
  if (input.mode === 'UNIVERSAL' && input.vehicles.length)
    return invalidPart('PART_UNIVERSAL_FITMENT_CONFLICT');
  const seen = new Set<string>();
  for (const row of input.vehicles) {
    for (const year of [row.yearFrom, row.yearTo])
      if (
        year != null &&
        (!Number.isInteger(year) || year < 1886 || year > 2100)
      )
        return invalidPart('PART_INVALID_YEAR_RANGE');
    if (row.yearFrom != null && row.yearTo != null && row.yearFrom > row.yearTo)
      return invalidPart('PART_INVALID_YEAR_RANGE');
    const key = JSON.stringify([
      row.modelId.toLowerCase(),
      row.generationId?.toLowerCase() ?? null,
      row.yearFrom ?? null,
      row.yearTo ?? null,
    ]);
    if (seen.has(key)) return invalidPart('PART_DUPLICATE_FITMENT');
    seen.add(key);
  }
}
export function validateCategoryParent(
  id: string,
  parentId: string | null,
  parents: ReadonlyMap<string, string | null>,
): void {
  const seen = new Set([id]);
  let current = parentId;
  while (current !== null) {
    if (seen.has(current)) return invalidPart('PART_CATEGORY_CYCLE');
    if (!parents.has(current)) return invalidPart('PART_CATEGORY_NOT_FOUND');
    seen.add(current);
    current = parents.get(current) ?? null;
  }
}
