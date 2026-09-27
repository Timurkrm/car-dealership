'use client';
import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import type { ListingApi } from '../listings/listing-api';
import { ListingFields } from '../listings/listing-fields';
import { ListingError } from '../listings/listing-feedback';
import { useListingResource } from '../listings/listing-resource';
import { PART_CONDITIONS } from '../listings/listing-types';
import type {
  OwnerPartListing,
  FitmentMode,
  FitmentSelection,
} from '../listings/listing-types';
import type { PartApi } from './part-api';
import { FitmentEditor } from './fitment-editor';
import { partFormPayload } from './part-form-model';
import { PART_CONDITION_LABELS } from './part-labels';
export function PartForm({
  api,
  vehicleApi,
  initial,
  disabled,
  onSave,
  onError,
}: {
  api: PartApi;
  vehicleApi: ListingApi;
  initial?: OwnerPartListing;
  disabled: boolean;
  onSave: (body: ReturnType<typeof partFormPayload>) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const categories = useListingResource(
    useCallback((signal: AbortSignal) => api.categories(signal), [api]),
  );
  const brands = useListingResource(
    useCallback((signal: AbortSignal) => api.brands(signal), [api]),
  );
  const [fitment, setFitment] = useState<{
    mode: FitmentMode;
    vehicles: FitmentSelection[];
  }>(() => ({
    mode: initial?.part.fitmentMode ?? 'UNIVERSAL',
    vehicles:
      initial?.part.fitments.map((row) => ({
        modelId: row.model.id,
        generationId: row.generation?.id ?? null,
        yearFrom: row.yearFrom,
        yearTo: row.yearTo,
      })) ?? [],
  }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onSave(partFormPayload(new FormData(event.currentTarget), fitment));
    } catch (error) {
      onError(error);
    }
  }
  return (
    <form className="listing-form" onSubmit={submit} aria-busy={disabled}>
      <ListingError error={categories.error || brands.error} />
      <fieldset disabled={disabled}>
        <legend>Запчасть</legend>
        <div className="form-grid">
          <label>
            Категория
            <select
              name="categoryId"
              required
              defaultValue={initial?.part.category.id ?? ''}
              disabled={categories.loading || Boolean(categories.error)}
            >
              <option value="">Выберите категорию</option>
              {initial &&
                !categories.value?.some(
                  (row) => row.id === initial.part.category.id,
                ) && (
                  <option value={initial.part.category.id}>
                    {initial.part.category.name} (недоступна для новых
                    объявлений)
                  </option>
                )}
              {categories.value?.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.parentId ? '↳ ' : ''}
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Бренд (необязательно)
            <select
              name="brandId"
              defaultValue={initial?.part.brand?.id ?? ''}
              disabled={brands.loading || Boolean(brands.error)}
            >
              <option value="">Без бренда</option>
              {initial?.part.brand &&
                !brands.value?.some(
                  (row) => row.id === initial.part.brand?.id,
                ) && (
                  <option value={initial.part.brand.id}>
                    {initial.part.brand.name} (недоступен)
                  </option>
                )}
              {brands.value?.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Название запчасти
            <input
              name="name"
              required
              minLength={1}
              maxLength={200}
              defaultValue={initial?.part.name}
            />
          </label>
          <label>
            Состояние
            <select
              name="condition"
              defaultValue={initial?.part.condition ?? 'USED'}
            >
              {PART_CONDITIONS.map((row) => (
                <option key={row} value={row}>
                  {PART_CONDITION_LABELS[row]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Количество
            <input
              name="quantityAvailable"
              type="number"
              min={1}
              max={1000000}
              step={1}
              required
              defaultValue={initial?.part.quantityAvailable ?? 1}
            />
          </label>
          <label>
            Номер производителя
            <input
              name="manufacturerPartNumber"
              maxLength={100}
              defaultValue={initial?.part.manufacturerPartNumber ?? ''}
            />
          </label>
          <label>
            OEM номер
            <input
              name="oemNumber"
              maxLength={100}
              defaultValue={initial?.part.oemNumber ?? ''}
            />
          </label>
        </div>
        <p>
          Цена за одну единицу. Фотографии добавляются после сохранения
          черновика.
        </p>
        <FitmentEditor
          api={vehicleApi}
          initialLabels={initial?.part.fitments.map((row) =>
            [
              row.make.name,
              row.model.name,
              row.generation?.name ?? 'все поколения',
            ].join(' '),
          )}
          value={fitment}
          onChange={setFitment}
          onError={onError}
        />
      </fieldset>
      <ListingFields initial={initial} disabled={disabled} />
      <button
        type="submit"
        disabled={
          disabled ||
          categories.loading ||
          brands.loading ||
          Boolean(categories.error || brands.error)
        }
      >
        {disabled
          ? 'Сохранение…'
          : initial
            ? 'Сохранить изменения'
            : 'Создать черновик'}
      </button>
    </form>
  );
}
