'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { ListingApi } from '../listings/listing-api';
import { PartApi } from '../parts/part-api';
import { SearchClient } from './search-client';
import type { SearchListingType } from './search-client';
import { SearchSession } from './search-session';
import {
  parseSearchParameters,
  serializeSearchParameters,
} from './search-parameters';
import type {
  SearchParameters,
  PrivateSearchOrigin,
} from './search-parameters';
import { parsePartSearchParameters } from '../parts/part-filter-model';
import { SearchFilters } from './search-filters';
import { PartSearchFilters } from '../parts/part-search-filters';
import { SearchResults } from './search-results';
import { SearchToolbar } from './search-toolbar';
import { SearchFacetSummary } from './search-facets';
import { SaveSearchButton } from '../engagement/save-search-button';
import {
  cameraForSearch,
  catalogUrl,
  parseMapUrlState,
  searchInArea,
  searchOnlyParameters,
} from '../map/map-state';
import { MarketplaceMapExperience } from '../map/marketplace-map-experience';
import {
  activeSearchFilters,
  publicSearchInput,
  removeSearchFilter,
} from './search-presentation';
import { Dialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { FilterChip } from '../../components/ui/chip';
import { Alert } from '../../components/ui/feedback';
import { VEHICLE_OPTION_LABELS } from '../listings/vehicle-labels';
import { PART_CONDITION_LABELS } from '../parts/part-labels';

const subscribeWidth = (callback: () => void) => {
  const query = window.matchMedia('(max-width: 1199px)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
export function SearchWorkspace({ type }: { type: SearchListingType }) {
  const { client } = useAuth();
  const router = useRouter();
  const raw = useSearchParams().toString();
  const path = type === 'VEHICLE' ? '/cars' : '/parts';
  const navigating = useRef(false);
  const pendingUrl = useRef<string | null>(null);
  const mobile = useSyncExternalStore(
    subscribeWidth,
    () => window.matchMedia('(max-width: 1199px)').matches,
    () => false,
  );
  const [drawer, setDrawer] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const [privateState, setPrivate] = useState<{
    key: string;
    origin: PrivateSearchOrigin;
  } | null>(null);
  const mapUrl = useMemo(
    () => parseMapUrlState(new URLSearchParams(raw)),
    [raw],
  );
  const filterRaw = useMemo(
    () => searchOnlyParameters(new URLSearchParams(raw)).toString(),
    [raw],
  );
  const parsed = useMemo(
    () =>
      (type === 'VEHICLE' ? parseSearchParameters : parsePartSearchParameters)(
        new URLSearchParams(filterRaw),
      ),
    [filterRaw, type],
  );
  const publicKey = serializeSearchParameters(parsed.parameters);
  useEffect(() => {
    pendingUrl.current = null;
  }, [raw]);
  const privateOrigin =
    privateState?.key === publicKey ? privateState.origin : null;
  const parameters = useMemo(
    () => ({ ...parsed.parameters, ...(privateOrigin ?? {}) }),
    [parsed.parameters, privateOrigin],
  );
  const key = serializeSearchParameters(parameters);
  const vehicles = useMemo(() => new ListingApi(client), [client]);
  const parts = useMemo(() => new PartApi(client), [client]);
  const api = useMemo(() => new SearchClient(client), [client]);
  const session = useMemo(
    () =>
      new SearchSession((filters, cursor, signal) =>
        api.listings(type, filters, cursor, signal),
      ),
    [api, type],
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
  useEffect(() => {
    const back = () => {
      setPrivate(null);
      setDrawer(false);
      navigating.current = false;
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const remember = useCallback((rows: { id: string; name: string }[]) => {
    setNames((current) =>
      rows.every((row) => current.get(row.id) === row.name)
        ? current
        : new Map([
            ...current,
            ...rows.map((row) => [row.id, row.name] as const),
          ]),
    );
  }, []);
  const labels = useMemo(() => {
    const labels = new Map([
      ...Object.entries(VEHICLE_OPTION_LABELS),
      ...(type === 'PART' ? Object.entries(PART_CONDITION_LABELS) : []),
      ...names,
    ]);
    for (const item of state.items) {
      const rows =
        item.type === 'VEHICLE'
          ? [item.vehicle.make, item.vehicle.model, item.vehicle.generation]
          : [item.part.category, item.part.brand];
      for (const row of rows) if (row) labels.set(row.id, row.name);
    }
    return labels;
  }, [names, state.items, type]);
  const chips = activeSearchFilters(
    type,
    parameters,
    labels,
    Boolean(privateOrigin),
  );
  function apply(next: SearchParameters, origin?: PrivateSearchOrigin) {
    navigating.current = false;
    const url = catalogUrl(path, next, mapUrl, !origin);
    pendingUrl.current =
      window.location.pathname + window.location.search === url
        ? null
        : serializeSearchParameters(next);
    setPrivate(
      origin ? { key: serializeSearchParameters(next), origin } : null,
    );
    setDrawer(false);
    router.push(url, { scroll: false });
  }
  function applyEffective(next: SearchParameters) {
    const safe = publicSearchInput(next, Boolean(privateOrigin));
    apply(safe.filters, safe.origin);
  }
  const filterProps = {
    parameters,
    privateOriginActive: Boolean(privateOrigin),
    onApply: apply,
    mobile,
    onLabels: remember,
  };
  const form =
    type === 'VEHICLE' ? (
      <SearchFilters key={key} api={vehicles} {...filterProps} />
    ) : (
      <PartSearchFilters
        key={key}
        api={parts}
        vehicles={vehicles}
        {...filterProps}
      />
    );
  const view = mobile && mapUrl.view === 'split' ? 'list' : mapUrl.view;
  const firstPoint = state.items.find((item) => item.location?.publicPoint)
    ?.location?.publicPoint;
  const camera = cameraForSearch(
    privateOrigin ? null : mapUrl.camera,
    parameters,
    firstPoint,
  );
  return (
    <main id="main" className="search-workspace">
      <div className="search-heading">
        <div>
          <p className="ui-metadata">
            Automotive Marketplace /{' '}
            {type === 'VEHICLE' ? 'Автомобили' : 'Запчасти'}
          </p>
          <h1>
            {type === 'VEHICLE'
              ? 'Каталог автомобилей'
              : 'Автомобильные запчасти'}
          </h1>
        </div>
        <SaveSearchButton
          type={type}
          filters={parsed.parameters}
          privateOrigin={Boolean(privateOrigin)}
        />
      </div>
      {parsed.error && (
        <Alert tone="error">
          {parsed.error} Показан каталог без некорректных фильтров.
        </Alert>
      )}
      {chips.length > 0 && (
        <div
          className="search-active-filters"
          role="group"
          aria-label="Применённые фильтры"
        >
          {chips.map((chip) => (
            <FilterChip
              key={chip.key + ':' + (chip.value ?? '')}
              removable
              removeLabel={`Убрать фильтр: ${chip.label}`}
              onClick={() =>
                applyEffective(
                  removeSearchFilter(parameters, chip.key, chip.value),
                )
              }
            >
              {chip.label}
            </FilterChip>
          ))}
          <Button variant="ghost" onClick={() => apply({})}>
            Очистить фильтры
          </Button>
        </div>
      )}
      <SearchToolbar
        type={type}
        parameters={parameters}
        loaded={state.items.length}
        loading={state.loading}
        view={view}
        mobile={mobile}
        count={chips.length}
        openFilters={(event) => {
          trigger.current = event.currentTarget;
          setDrawer(true);
        }}
        onSort={(sort) => applyEffective({ ...parameters, sort })}
        onView={(next) => {
          if (next === view) return;
          pendingUrl.current = publicKey;
          setDrawer(false);
          router.push(
            catalogUrl(
              path,
              parsed.parameters,
              { ...mapUrl, view: next },
              !privateOrigin,
            ),
            { scroll: false },
          );
        }}
      />
      <div className="search-layout">
        {!mobile && (
          <aside className="search-sidebar" aria-label="Фильтры поиска">
            <h2>Фильтры</h2>
            {form}
          </aside>
        )}
        <MarketplaceMapExperience
          type={type}
          api={api}
          filters={parameters}
          view={view}
          camera={camera}
          items={state.items}
          allowCameraUrl={!privateOrigin}
          onNavigate={() => {
            navigating.current = true;
          }}
          onCamera={(nextCamera) => {
            if (
              navigating.current ||
              pendingUrl.current !== null ||
              window.location.pathname !== path
            )
              return;
            // Native history updates presentation only, without a server navigation per pan.
            window.history.replaceState(
              null,
              '',
              catalogUrl(
                path,
                parsed.parameters,
                { ...mapUrl, camera: nextCamera },
                true,
              ),
            );
          }}
          onSearchArea={(bounds) => apply(searchInArea(parameters, bounds))}
          renderList={(selectedId, onSelect, hoveredId, onHover) => (
            <>
              <div className="search-result-actions">
                <Button
                  variant="ghost"
                  onClick={() => void session.reset(key, parameters)}
                >
                  Обновить выдачу и фотографии
                </Button>
                <SearchFacetSummary
                  key={'facets-' + key}
                  type={type}
                  api={api}
                  parameters={parameters}
                  labels={labels}
                />
              </div>
              <SearchResults
                state={state}
                onReset={() => apply({})}
                onRetry={() => void session.retry()}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={onSelect}
                onHover={onHover}
                variant={view === 'split' ? 'list' : 'grid'}
                onNavigate={() => {
                  navigating.current = true;
                }}
              />
              <div className="search-pagination">
                <Button
                  variant="outline"
                  disabled={state.loading || !state.nextCursor}
                  loading={state.loading && state.items.length > 0}
                  onClick={() => void session.loadMore()}
                >
                  Показать ещё
                </Button>
              </div>
            </>
          )}
        />
      </div>
      <Dialog
        open={drawer && mobile}
        onClose={() => setDrawer(false)}
        title="Фильтры поиска"
        variant="drawer"
        closeOnBackdrop
        returnFocusRef={trigger}
      >
        {drawer && mobile && form}
      </Dialog>
    </main>
  );
}
