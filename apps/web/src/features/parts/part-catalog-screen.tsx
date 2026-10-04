'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { ListingApi } from '../listings/listing-api';
import { CatalogSelects } from '../listings/catalog-selects';
import { CURRENCIES, PART_CONDITIONS } from '../listings/listing-types';
import { useListingResource } from '../listings/listing-resource';
import { ListingError } from '../listings/listing-feedback';
import {
  decimalFromMinor,
  minorFromDecimal,
} from '../listings/listing-form-model';
import { SearchClient } from '../search/search-client';
import { SearchSession } from '../search/search-session';
import { MarketplaceResult } from '../results/marketplace-result';
import { EmptyState } from '../../components/ui/feedback';
import { Button } from '../../components/ui/button';
import { ResultLayout, ResultLoading } from '../results/result-layout';
import { SearchFacetSummary } from '../search/search-facets';
import {
  requestSearchOrigin,
  serializeSearchParameters,
} from '../search/search-parameters';
import type { SearchParameters } from '../search/search-parameters';
import type { PrivateSearchOrigin } from '../search/search-parameters';
import {
  cameraForSearch,
  catalogUrl,
  parseMapUrlState,
  searchInArea,
  searchOnlyParameters,
} from '../map/map-state';
import { MarketplaceMapExperience } from '../map/marketplace-map-experience';
import { SaveSearchButton } from '../engagement/save-search-button';
import { PartApi } from './part-api';
import { PART_CONDITION_LABELS } from './part-labels';
import {
  parsePartSearchParameters,
  validatePartSearch,
} from './part-filter-model';

const PRICE_FIELDS = [
  ['priceFrom', 'Цена от', 'priceFromMinor'],
  ['priceTo', 'Цена до', 'priceToMinor'],
] as const;

function PartFacetSummary({
  catalog,
  search,
  parameters,
}: {
  catalog: PartApi;
  search: SearchClient;
  parameters: SearchParameters;
}) {
  const categories = useListingResource(
    useCallback((signal: AbortSignal) => catalog.categories(signal), [catalog]),
  );
  const brands = useListingResource(
    useCallback((signal: AbortSignal) => catalog.brands(signal), [catalog]),
  );
  const labels = useMemo(
    () =>
      new Map([
        ...(categories.value ?? []).map((row) => [row.id, row.name] as const),
        ...(brands.value ?? []).map((row) => [row.id, row.name] as const),
        ...Object.entries(PART_CONDITION_LABELS),
      ]),
    [brands.value, categories.value],
  );
  return (
    <SearchFacetSummary
      type="PART"
      api={search}
      parameters={parameters}
      labels={labels}
    />
  );
}

function PartFilters({
  api,
  vehicles,
  parameters,
  privateOriginActive = false,
  apply,
}: {
  api: PartApi;
  vehicles: ListingApi;
  parameters: SearchParameters;
  privateOriginActive?: boolean;
  apply: (parameters: SearchParameters, origin?: PrivateSearchOrigin) => void;
}) {
  const categories = useListingResource(
    useCallback((signal: AbortSignal) => api.categories(signal), [api]),
  );
  const brands = useListingResource(
    useCallback((signal: AbortSignal) => api.brands(signal), [api]),
  );
  const [selection, setSelection] = useState({
    makeId: parameters.compatibleMakeId ?? '',
    modelId: parameters.compatibleModelId ?? '',
    generationId: parameters.compatibleGenerationId ?? '',
  });
  const [currency, setCurrency] = useState(parameters.currency ?? '');
  const [origin, setOrigin] = useState({
    lat: parameters.lat ?? '',
    lng: parameters.lng ?? '',
  });
  const [error, setError] = useState<unknown>(null);
  const [browserOrigin, setBrowserOrigin] = useState(privateOriginActive);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const next: SearchParameters = {};
      if (parameters.bbox) next.bbox = parameters.bbox;
      for (const key of [
        'categoryId',
        'brandId',
        'oemNumber',
        'manufacturerPartNumber',
        'partNumber',
        'compatibleYear',
        'fitmentMode',
        'sort',
        'radiusMeters',
      ]) {
        const value = data.get(key);
        if (typeof value === 'string' && value.trim()) next[key] = value.trim();
      }
      const conditions = data
        .getAll('condition')
        .filter((value): value is string => typeof value === 'string');
      if (conditions.length) next.condition = conditions.sort().join(',');
      next.includeSubcategories = data.has('includeSubcategories')
        ? 'true'
        : 'false';
      next.includeUniversal = data.has('includeUniversal') ? 'true' : 'false';
      if (selection.makeId) next.compatibleMakeId = selection.makeId;
      if (selection.modelId) next.compatibleModelId = selection.modelId;
      if (selection.generationId)
        next.compatibleGenerationId = selection.generationId;
      if (currency) next.currency = currency;
      if (origin.lat && origin.lng) {
        delete next.bbox;
        next.lat = origin.lat;
        next.lng = origin.lng;
      } else {
        delete next.radiusMeters;
        if (next.sort === 'distance') next.sort = 'newest';
      }
      for (const [field, key] of [
        ['priceFrom', 'priceFromMinor'],
        ['priceTo', 'priceToMinor'],
      ] as const) {
        const value = data.get(field);
        if (typeof value === 'string' && value.trim())
          next[key] =
            value.trim() === '0' ? '0' : minorFromDecimal(value, currency);
      }
      const validation = validatePartSearch(next);
      if (validation) throw new Error(validation);
      setError(null);
      if (browserOrigin && next.lat && next.lng) {
        const publicFilters = { ...next };
        delete publicFilters.lat;
        delete publicFilters.lng;
        delete publicFilters.radiusMeters;
        if (publicFilters.sort === 'distance') delete publicFilters.sort;
        apply(publicFilters, {
          lat: next.lat,
          lng: next.lng,
          ...(next.radiusMeters ? { radiusMeters: next.radiusMeters } : {}),
          ...(next.sort === 'distance' ? { sort: 'distance' as const } : {}),
        });
      } else apply(next);
    } catch (failure) {
      setError(failure);
    }
  }

  async function nearMe() {
    try {
      const value = await requestSearchOrigin(
        typeof navigator === 'undefined' ? undefined : navigator.geolocation,
      );
      setBrowserOrigin(true);
      setOrigin(value);
      setError(null);
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <details className="listing-form" open>
      <summary>Фильтры запчастей</summary>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Категория
            <select
              name="categoryId"
              defaultValue={parameters.categoryId ?? ''}
              disabled={categories.loading}
            >
              <option value="">Все категории</option>
              {categories.value?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.parentId ? '↳ ' : ''}
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              name="includeSubcategories"
              type="checkbox"
              defaultChecked={parameters.includeSubcategories !== 'false'}
            />
            Включать подкатегории
          </label>
          <label>
            Бренд
            <select
              name="brandId"
              defaultValue={parameters.brandId ?? ''}
              disabled={brands.loading}
            >
              <option value="">Все бренды</option>
              {brands.value?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Состояние</legend>
            {PART_CONDITIONS.map((row) => (
              <label key={row}>
                <input
                  type="checkbox"
                  name="condition"
                  value={row}
                  defaultChecked={parameters.condition
                    ?.split(',')
                    .includes(row)}
                />
                {PART_CONDITION_LABELS[row]}
              </label>
            ))}
          </fieldset>
          <label>
            Номер OEM или производителя
            <input
              name="partNumber"
              maxLength={100}
              defaultValue={parameters.partNumber ?? ''}
            />
          </label>
          <label>
            OEM номер
            <input
              name="oemNumber"
              maxLength={100}
              defaultValue={parameters.oemNumber ?? ''}
            />
          </label>
          <label>
            Номер производителя
            <input
              name="manufacturerPartNumber"
              maxLength={100}
              defaultValue={parameters.manufacturerPartNumber ?? ''}
            />
          </label>
          <CatalogSelects
            api={vehicles}
            selection={selection}
            onChange={setSelection}
            required={false}
          />
          <label>
            Год совместимости
            <input
              name="compatibleYear"
              inputMode="numeric"
              maxLength={4}
              defaultValue={parameters.compatibleYear ?? ''}
            />
          </label>
          <label>
            Тип совместимости
            <select
              name="fitmentMode"
              defaultValue={parameters.fitmentMode ?? ''}
            >
              <option value="">Любой</option>
              <option value="UNIVERSAL">Универсальные</option>
              <option value="VEHICLE_SPECIFIC">
                Для выбранных автомобилей
              </option>
            </select>
          </label>
          <label>
            <input
              name="includeUniversal"
              type="checkbox"
              defaultChecked={parameters.includeUniversal !== 'false'}
            />
            Включать универсальные при поиске совместимости
          </label>
          <label>
            Валюта
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option value="">Любая валюта</option>
              {CURRENCIES.map((row) => (
                <option key={row}>{row}</option>
              ))}
            </select>
          </label>
          {PRICE_FIELDS.map(([name, label, key]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                inputMode="decimal"
                maxLength={22}
                defaultValue={
                  parameters[key] && parameters.currency
                    ? decimalFromMinor(parameters[key], parameters.currency)
                    : ''
                }
              />
            </label>
          ))}
          <label>
            Сортировка
            <select name="sort" defaultValue={parameters.sort ?? 'newest'}>
              <option value="newest">Сначала новые</option>
              <option value="price_asc">Цена ↑</option>
              <option value="price_desc">Цена ↓</option>
              {origin.lat && origin.lng && (
                <option value="distance">Расстояние</option>
              )}
            </select>
          </label>
          <label>
            Широта
            <input
              value={origin.lat}
              maxLength={24}
              onChange={(event) => {
                setBrowserOrigin(false);
                setOrigin((value) => ({ ...value, lat: event.target.value }));
              }}
            />
          </label>
          <label>
            Долгота
            <input
              value={origin.lng}
              maxLength={24}
              onChange={(event) => {
                setBrowserOrigin(false);
                setOrigin((value) => ({ ...value, lng: event.target.value }));
              }}
            />
          </label>
          <label>
            Радиус, м
            <input
              name="radiusMeters"
              inputMode="numeric"
              maxLength={6}
              defaultValue={parameters.radiusMeters ?? '50000'}
            />
          </label>
        </div>
        <ListingError error={error || categories.error || brands.error} />
        <button type="button" onClick={() => void nearMe()}>
          Рядом со мной
        </button>
        <button type="submit">Применить фильтры</button>
        <button type="button" onClick={() => apply({})}>
          Сбросить фильтры
        </button>
      </form>
    </details>
  );
}

export function PartCatalogScreen() {
  const { client } = useAuth();
  const router = useRouter();
  const raw = useSearchParams().toString();
  const navigating = useRef(false);
  const [privateOrigin, setPrivateOrigin] =
    useState<PrivateSearchOrigin | null>(null);
  const mapUrl = useMemo(
    () => parseMapUrlState(new URLSearchParams(raw)),
    [raw],
  );
  const filterRaw = useMemo(
    () => searchOnlyParameters(new URLSearchParams(raw)).toString(),
    [raw],
  );
  const parsed = useMemo(
    () => parsePartSearchParameters(new URLSearchParams(filterRaw)),
    [filterRaw],
  );
  const parameters = useMemo(
    () => ({ ...parsed.parameters, ...(privateOrigin ?? {}) }),
    [parsed.parameters, privateOrigin],
  );
  const key = serializeSearchParameters(parameters);
  const parts = useMemo(() => new PartApi(client), [client]);
  const vehicles = useMemo(() => new ListingApi(client), [client]);
  const search = useMemo(() => new SearchClient(client), [client]);
  const session = useMemo(
    () =>
      new SearchSession((parameters, cursor, signal) =>
        search.listings('PART', parameters, cursor, signal),
      ),
    [search],
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.serverSnapshot,
  );
  useEffect(() => {
    void session.reset(key, parameters);
    return () => session.dispose();
  }, [key, parameters, session]);
  const navigate = (next: SearchParameters, origin?: PrivateSearchOrigin) => {
    setPrivateOrigin(origin ?? null);
    router.push(catalogUrl('/parts', next, mapUrl, origin === undefined), {
      scroll: false,
    });
  };
  const firstPoint = state.items.find((item) => item.location?.publicPoint)
    ?.location?.publicPoint;
  const camera = cameraForSearch(mapUrl.camera, parameters, firstPoint);
  return (
    <main id="main" className="catalog-page">
      <h1>Автомобильные запчасти</h1>
      {parsed.error && (
        <p role="alert">
          {parsed.error} Показан каталог без некорректных фильтров.
        </p>
      )}
      <PartFilters
        key={filterRaw + (privateOrigin ? ':private' : '')}
        api={parts}
        vehicles={vehicles}
        parameters={parameters}
        privateOriginActive={Boolean(privateOrigin)}
        apply={navigate}
      />
      <SaveSearchButton
        type="PART"
        filters={parsed.parameters}
        privateOrigin={Boolean(privateOrigin)}
      />
      <MarketplaceMapExperience
        type="PART"
        api={search}
        filters={parameters}
        view={mapUrl.view}
        camera={camera}
        items={state.items}
        allowCameraUrl={!privateOrigin}
        onView={(view) =>
          router.push(
            catalogUrl(
              '/parts',
              parsed.parameters,
              { ...mapUrl, view },
              !privateOrigin,
            ),
            { scroll: false },
          )
        }
        onCamera={(nextCamera) => {
          if (navigating.current || window.location.pathname !== '/parts')
            return;
          router.replace(
            catalogUrl(
              '/parts',
              parsed.parameters,
              { ...mapUrl, camera: nextCamera },
              true,
            ),
            { scroll: false },
          );
        }}
        onSearchArea={(bounds) => {
          setPrivateOrigin(null);
          router.push(
            catalogUrl(
              '/parts',
              searchInArea(parsed.parameters, bounds),
              mapUrl,
              true,
            ),
            { scroll: false },
          );
        }}
        renderList={(selectedId, onSelect) => (
          <>
            <PartFacetSummary
              key={'facets-' + key}
              catalog={parts}
              search={search}
              parameters={parameters}
            />
            {state.loading && state.items.length === 0 && (
              <>
                <p role="status">Загружаем запчасти…</p>
                <ResultLoading />
              </>
            )}
            <ListingError error={state.error} />
            {Boolean(state.error) && (
              <button onClick={() => void session.reset(key, parameters)}>
                Повторить
              </button>
            )}
            {!state.loading && !state.error && state.items.length === 0 && (
              <EmptyState
                title="По вашему запросу ничего не найдено"
                action={
                  <Button variant="outline" onClick={() => navigate({})}>
                    Сбросить фильтры
                  </Button>
                }
              />
            )}
            <ResultLayout>
              {state.items.map((listing) => (
                <MarketplaceResult
                  key={listing.id}
                  listing={listing}
                  selected={listing.id === selectedId}
                  onSelect={onSelect}
                  onNavigate={() => {
                    navigating.current = true;
                  }}
                />
              ))}
            </ResultLayout>
            <button
              disabled={state.loading || !state.nextCursor}
              onClick={() => void session.loadMore()}
            >
              Показать ещё
            </button>
          </>
        )}
      />
    </main>
  );
}
