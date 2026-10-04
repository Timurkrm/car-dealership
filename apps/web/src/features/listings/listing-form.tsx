'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ListingApi } from './listing-api';
import type { OwnerListing } from './listing-types';
import { SPEC_OPTIONS } from './listing-types';
import { formPayload, initialSelection } from './listing-form-model';
import { ListingFields } from './listing-fields';
import { CatalogSelects } from './catalog-selects';

const FIELD_LABELS: Record<string, string> = {
  bodyType: 'Кузов',
  fuelType: 'Топливо',
  transmission: 'Коробка передач',
  driveType: 'Привод',
  condition: 'Состояние',
  color: 'Цвет',
};
import { VEHICLE_OPTION_LABELS as OPTION_LABELS } from './vehicle-labels';
export function ListingForm({
  api,
  initial,
  disabled,
  onSave,
  onError,
}: {
  api: ListingApi;
  initial?: OwnerListing;
  disabled: boolean;
  onSave: (body: ReturnType<typeof formPayload>) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [selection, setSelection] = useState(() => initialSelection(initial));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onSave(formPayload(new FormData(event.currentTarget), selection));
    } catch (error) {
      onError(error);
    }
  }
  return (
    <form className="listing-form" onSubmit={submit} aria-busy={disabled}>
      <fieldset disabled={disabled}>
        <legend>Автомобиль</legend>
        <CatalogSelects
          api={api}
          selection={selection}
          onChange={setSelection}
        />
        <div className="form-grid">
          <label>
            Год
            <input
              name="year"
              type="number"
              min={1886}
              max={2100}
              step={1}
              required
              defaultValue={initial?.vehicle.year}
            />
          </label>
          <label>
            Пробег, км
            <input
              name="mileageKm"
              type="number"
              min={0}
              max={2147483647}
              step={1}
              required
              defaultValue={initial?.vehicle.mileageKm}
            />
          </label>
          {Object.entries(SPEC_OPTIONS).map(([key, options]) => (
            <label key={key}>
              {FIELD_LABELS[key]}
              <select
                name={key}
                required={key !== 'color'}
                defaultValue={
                  initial
                    ? (Object.entries(initial.vehicle)
                        .find(([field]) => field === key)?.[1]
                        ?.toString() ?? '')
                    : ''
                }
              >
                <option value="">
                  {key === 'color' ? 'Не указан' : 'Выберите'}
                </option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {OPTION_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Мощность, л. с. (необязательно)
            <input
              name="enginePowerHp"
              type="number"
              min={1}
              max={2147483647}
              step={1}
              defaultValue={initial?.vehicle.enginePowerHp ?? ''}
            />
          </label>
          <label>
            Объём двигателя, см³ (необязательно)
            <input
              name="engineDisplacementCc"
              type="number"
              min={1}
              max={2147483647}
              step={1}
              defaultValue={initial?.vehicle.engineDisplacementCc ?? ''}
            />
          </label>
          <label>
            VIN (необязательно, только для владельца)
            <input
              name="vin"
              minLength={17}
              maxLength={17}
              autoCapitalize="characters"
              defaultValue={initial?.vehicle.vin ?? ''}
            />
          </label>
        </div>
      </fieldset>
      <ListingFields initial={initial} disabled={disabled} />
      <button type="submit" disabled={disabled || !selection.modelId}>
        {disabled
          ? 'Сохранение недоступно…'
          : initial
            ? 'Сохранить изменения'
            : 'Создать черновик'}
      </button>
    </form>
  );
}
