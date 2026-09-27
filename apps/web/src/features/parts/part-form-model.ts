import { AuthApiError } from '../auth/auth-client';
import { commonPayload, field, integer } from '../listings/listing-form-model';
import { PART_CONDITIONS } from '../listings/listing-types';
import type { FitmentMode, FitmentSelection } from '../listings/listing-types';
export function addFitment(
  rows: FitmentSelection[],
  next: FitmentSelection,
): FitmentSelection[] {
  if (
    !next.modelId ||
    rows.length >= 50 ||
    (next.yearFrom !== null &&
      (!Number.isInteger(next.yearFrom) ||
        next.yearFrom < 1886 ||
        next.yearFrom > 2100)) ||
    (next.yearTo !== null &&
      (!Number.isInteger(next.yearTo) ||
        next.yearTo < 1886 ||
        next.yearTo > 2100)) ||
    (next.yearFrom !== null &&
      next.yearTo !== null &&
      next.yearFrom > next.yearTo) ||
    rows.some((row) => JSON.stringify(row) === JSON.stringify(next))
  )
    throw new AuthApiError(400, 'PART_INVALID_FITMENT');
  return [...rows, next];
}
export function changeFitmentMode(
  current: { mode: FitmentMode; vehicles: FitmentSelection[] },
  mode: FitmentMode,
  discardConfirmed: boolean,
) {
  if (mode === 'UNIVERSAL' && current.vehicles.length && !discardConfirmed)
    return current;
  return { mode, vehicles: mode === 'UNIVERSAL' ? [] : current.vehicles };
}
export function partFormPayload(
  data: FormData,
  fitment: { mode: FitmentMode; vehicles: FitmentSelection[] },
) {
  const condition = PART_CONDITIONS.find(
    (item) => item === field(data, 'condition'),
  );
  if (
    !condition ||
    !field(data, 'categoryId') ||
    (fitment.mode === 'UNIVERSAL' && fitment.vehicles.length)
  )
    throw new AuthApiError(400, 'VALIDATION_ERROR');
  let checked: FitmentSelection[] = [];
  for (const row of fitment.vehicles) checked = addFitment(checked, row);
  const number = (key: string) => {
    const value = field(data, key).trim().toUpperCase();
    if (
      value &&
      (value.length > 100 || !/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(value))
    )
      throw new AuthApiError(400, 'PART_INVALID_NUMBER');
    return value || null;
  };
  return {
    ...commonPayload(data),
    quantityAvailable: integer(data, 'quantityAvailable', 1, 1000000),
    part: {
      categoryId: field(data, 'categoryId'),
      brandId: field(data, 'brandId') || null,
      name: field(data, 'name').trim(),
      condition,
      manufacturerPartNumber: number('manufacturerPartNumber'),
      oemNumber: number('oemNumber'),
      fitment: { mode: fitment.mode, vehicles: checked },
    },
  };
}
