'use client';
import { useCallback, useEffect } from 'react';
import { CatalogSelects } from '../listings/catalog-selects';
import type { ListingApi } from '../listings/listing-api';
import { useListingResource } from '../listings/listing-resource';
import { PART_CONDITIONS } from '../listings/listing-types';
import type { PartCategory } from '../listings/listing-types';
import { PART_CONDITION_LABELS } from './part-labels';
import type { PartApi } from './part-api';
import { Checkbox, Input, Select } from '../../components/ui/field';
import { Alert } from '../../components/ui/feedback';
import { FilterForm } from '../search/filter-form';
import type { FilterFormProps } from '../search/filter-form';
import { FITMENT_LABELS } from '../search/search-presentation';
import { partFilterFormParameters } from './part-filter-model';

/** Hierarchy is reference data; bounded traversal also tolerates corrupt cycles. */
export function categoryOptions(rows: PartCategory[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path = (row: PartCategory) => {
    const names = [row.name];
    const visited = new Set([row.id]);
    let parent = row.parentId ? byId.get(row.parentId) : undefined;
    while (parent && !visited.has(parent.id) && names.length < 32) {
      names.unshift(parent.name);
      visited.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return names.join(' / ');
  };
  return rows
    .map((row) => ({ ...row, label: path(row) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}
export function PartSearchFilters({
  api,
  vehicles,
  onLabels,
  ...props
}: FilterFormProps & {
  api: PartApi;
  vehicles: ListingApi;
  onLabels?: (rows: { id: string; name: string }[]) => void;
}) {
  const categories = useListingResource(
    useCallback((signal: AbortSignal) => api.categories(signal), [api]),
  );
  const brands = useListingResource(
    useCallback((signal: AbortSignal) => api.brands(signal), [api]),
  );
  useEffect(() => {
    onLabels?.([...(categories.value ?? []), ...(brands.value ?? [])]);
  }, [categories.value, brands.value, onLabels]);
  return (
    <FilterForm {...props} parse={partFilterFormParameters}>
      {({ draft, change, error }) => (
        <>
          <fieldset>
            <legend>Запчасть</legend>
            <Select
              label="Категория"
              name="categoryId"
              value={draft.categoryId ?? ''}
              onChange={(event) =>
                change({ ...draft, categoryId: event.target.value })
              }
              disabled={categories.loading}
            >
              <option value="">Все категории</option>
              {categoryOptions(categories.value ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </Select>
            <Checkbox
              name="includeSubcategories"
              label="Включать подкатегории"
              defaultChecked={props.parameters.includeSubcategories !== 'false'}
            />
            <Select
              label="Бренд"
              name="brandId"
              value={draft.brandId ?? ''}
              onChange={(event) =>
                change({ ...draft, brandId: event.target.value })
              }
              disabled={brands.loading}
            >
              <option value="">Все бренды</option>
              {brands.value?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
            {categories.error || brands.error ? (
              <Alert tone="error">
                Не удалось загрузить справочник. Обновите страницу.
              </Alert>
            ) : null}
          </fieldset>
          <fieldset>
            <legend>Состояние</legend>
            <div className="search-choices">
              {PART_CONDITIONS.map((value) => (
                <Checkbox
                  key={value}
                  name="condition"
                  value={value}
                  label={PART_CONDITION_LABELS[value]}
                  defaultChecked={props.parameters.condition
                    ?.split(',')
                    .includes(value)}
                />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Номер детали</legend>
            <Input
              label="Номер OEM или производителя"
              name="partNumber"
              maxLength={100}
              defaultValue={props.parameters.partNumber ?? ''}
              error={error?.includes('номер') ? error : undefined}
            />
            <details
              open={Boolean(
                props.parameters.oemNumber ||
                props.parameters.manufacturerPartNumber,
              )}
            >
              <summary>Отдельные номера</summary>
              <Input
                label="OEM номер"
                name="oemNumber"
                maxLength={100}
                defaultValue={props.parameters.oemNumber ?? ''}
              />
              <Input
                label="Номер производителя"
                name="manufacturerPartNumber"
                maxLength={100}
                defaultValue={props.parameters.manufacturerPartNumber ?? ''}
              />
            </details>
          </fieldset>
          <details
            open={Boolean(
              draft.compatibleMakeId ||
              draft.compatibleYear ||
              draft.fitmentMode,
            )}
          >
            <summary>Совместимость</summary>
            <CatalogSelects
              api={vehicles}
              required={false}
              onOptions={onLabels}
              selection={{
                makeId: draft.compatibleMakeId ?? '',
                modelId: draft.compatibleModelId ?? '',
                generationId: draft.compatibleGenerationId ?? '',
              }}
              onChange={(next) =>
                change({
                  ...draft,
                  compatibleMakeId: next.makeId,
                  compatibleModelId: next.modelId,
                  compatibleGenerationId: next.generationId,
                })
              }
            />
            <Input
              label="Год совместимости"
              name="compatibleYear"
              type="number"
              min={1886}
              max={2100}
              step={1}
              defaultValue={props.parameters.compatibleYear ?? ''}
              error={error?.includes('год') ? error : undefined}
            />
            <fieldset>
              <legend>Тип совместимости</legend>
              {Object.entries(FITMENT_LABELS).map(([value, label]) => (
                <Checkbox
                  key={value}
                  name="fitmentMode"
                  value={value}
                  label={label}
                  defaultChecked={props.parameters.fitmentMode
                    ?.split(',')
                    .includes(value)}
                />
              ))}
            </fieldset>
            <Checkbox
              name="includeUniversal"
              label="Включать универсальные при поиске совместимости"
              defaultChecked={props.parameters.includeUniversal !== 'false'}
            />
          </details>
        </>
      )}
    </FilterForm>
  );
}
