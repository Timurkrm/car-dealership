'use client';
import type { ListingApi } from '../listings/listing-api';
import { CatalogSelects } from '../listings/catalog-selects';
import { SPEC_OPTIONS } from '../listings/listing-types';
import { VEHICLE_OPTION_LABELS } from '../listings/vehicle-labels';
import { Checkbox, Input } from '../../components/ui/field';
import { filterFormParameters } from './search-parameters';
import { FILTER_LABELS } from './search-presentation';
import { FilterForm } from './filter-form';
import type { FilterFormProps } from './filter-form';

export function SearchFilters({
  api,
  onLabels,
  ...props
}: FilterFormProps & {
  api: ListingApi;
  onLabels?: (rows: { id: string; name: string }[]) => void;
}) {
  return (
    <FilterForm {...props} parse={filterFormParameters}>
      {({ draft, change, error }) => (
        <>
          <fieldset>
            <legend>Автомобиль</legend>
            <CatalogSelects
              api={api}
              required={false}
              onOptions={onLabels}
              selection={{
                makeId: draft.makeId ?? '',
                modelId: draft.modelId ?? '',
                generationId: draft.generationId ?? '',
              }}
              onChange={(next) => change({ ...draft, ...next })}
            />
          </fieldset>
          {(['year', 'mileage'] as const).map((kind) => (
            <fieldset key={kind}>
              <legend>{kind === 'year' ? 'Год выпуска' : 'Пробег'}</legend>
              <div className="search-range">
                {(['From', 'To'] as const).map((bound) => (
                  <Input
                    key={bound}
                    label={`${kind === 'year' ? 'Год' : 'Пробег'} ${bound === 'From' ? 'от' : 'до'}${kind === 'mileage' ? ', км' : ''}`}
                    name={`${kind}${bound}`}
                    type="number"
                    min={kind === 'year' ? 1886 : 0}
                    max={kind === 'year' ? 2100 : 2147483647}
                    step={1}
                    defaultValue={props.parameters[`${kind}${bound}`] ?? ''}
                    error={
                      error?.includes('не больше') ||
                      error?.includes('год и пробег')
                        ? error
                        : undefined
                    }
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <details
            open={Object.keys(SPEC_OPTIONS).some((key) =>
              Boolean(props.parameters[key]),
            )}
          >
            <summary>Характеристики автомобиля</summary>
            {Object.entries(SPEC_OPTIONS).map(([key, values]) => (
              <details key={key} open={Boolean(props.parameters[key])}>
                <summary>{FILTER_LABELS[key]}</summary>
                <div className="search-choices">
                  {values.map((value) => (
                    <Checkbox
                      key={value}
                      name={key}
                      value={value}
                      label={VEHICLE_OPTION_LABELS[value] ?? value}
                      defaultChecked={props.parameters[key]
                        ?.split(',')
                        .includes(value)}
                    />
                  ))}
                </div>
              </details>
            ))}
          </details>
        </>
      )}
    </FilterForm>
  );
}
