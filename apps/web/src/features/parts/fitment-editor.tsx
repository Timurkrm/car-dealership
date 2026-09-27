'use client';
import { useState } from 'react';
import type { ListingApi } from '../listings/listing-api';
import { CatalogSelects } from '../listings/catalog-selects';
import type { FitmentMode, FitmentSelection } from '../listings/listing-types';
import { addFitment, changeFitmentMode } from './part-form-model';
export function FitmentEditor({
  api,
  value,
  onChange,
  onError,
  initialLabels = [],
}: {
  api: ListingApi;
  value: { mode: FitmentMode; vehicles: FitmentSelection[] };
  onChange: (value: {
    mode: FitmentMode;
    vehicles: FitmentSelection[];
  }) => void;
  onError: (error: unknown) => void;
  initialLabels?: string[];
}) {
  const [selection, setSelection] = useState({
    makeId: '',
    modelId: '',
    generationId: '',
  });
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [selectionLabel, setSelectionLabel] = useState('');
  const [labels, setLabels] = useState(initialLabels);
  return (
    <fieldset>
      <legend>Совместимость</legend>
      <label>
        Тип совместимости
        <select
          value={value.mode}
          onChange={(event) => {
            const mode =
              event.target.value === 'UNIVERSAL'
                ? 'UNIVERSAL'
                : 'VEHICLE_SPECIFIC';
            const confirmed =
              mode !== 'UNIVERSAL' ||
              !value.vehicles.length ||
              window.confirm(
                'Удалить выбранные автомобили и сделать запчасть универсальной?',
              );
            onChange(changeFitmentMode(value, mode, confirmed));
            if (mode === 'UNIVERSAL' && confirmed) setLabels([]);
          }}
        >
          <option value="UNIVERSAL">Универсальная</option>
          <option value="VEHICLE_SPECIFIC">Для определённых автомобилей</option>
        </select>
      </label>
      {value.mode === 'VEHICLE_SPECIFIC' && (
        <>
          <div className="form-grid">
            <CatalogSelects
              api={api}
              selection={selection}
              onChange={setSelection}
              onLabelChange={setSelectionLabel}
              required={false}
            />
            <label>
              Год от (необязательно)
              <input
                type="number"
                min={1886}
                max={2100}
                value={yearFrom}
                onChange={(event) => setYearFrom(event.target.value)}
              />
            </label>
            <label>
              Год до (необязательно)
              <input
                type="number"
                min={1886}
                max={2100}
                value={yearTo}
                onChange={(event) => setYearTo(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!selection.modelId || value.vehicles.length >= 50}
            onClick={() => {
              try {
                onChange({
                  mode: value.mode,
                  vehicles: addFitment(value.vehicles, {
                    modelId: selection.modelId,
                    generationId: selection.generationId || null,
                    yearFrom: yearFrom ? Number(yearFrom) : null,
                    yearTo: yearTo ? Number(yearTo) : null,
                  }),
                });
                onError(null);
                setLabels((previous) => [...previous, selectionLabel]);
              } catch (error) {
                onError(error);
              }
            }}
          >
            Добавить автомобиль
          </button>
          <p>
            Без поколения: все поколения модели в указанные годы. Для модерации
            добавьте хотя бы один автомобиль. Не более 50 вариантов.
          </p>
          <ul>
            {value.vehicles.map((row, index) => (
              <li key={index}>
                {labels[index] ?? 'Автомобиль'}; {row.yearFrom ?? 'любой год'} —{' '}
                {row.yearTo ?? 'любой год'}{' '}
                <button
                  type="button"
                  onClick={() => {
                    onChange({
                      ...value,
                      vehicles: value.vehicles.filter(
                        (_, position) => position !== index,
                      ),
                    });
                    setLabels((previous) =>
                      previous.filter((_, position) => position !== index),
                    );
                  }}
                >
                  Удалить вариант {index + 1}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}
