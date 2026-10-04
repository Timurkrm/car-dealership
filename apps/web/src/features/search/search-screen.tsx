'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../auth/auth-provider';
import { ListingApi } from '../listings/listing-api';
import { ListingError } from '../listings/listing-feedback';
import { SearchClient } from './search-client';
import { SearchSession } from './search-session';
import {
  parseSearchParameters,
  serializeSearchParameters,
} from './search-parameters';
import { SearchFilters } from './search-filters';
import { MarketplaceResult } from '../results/marketplace-result';
import { ResultLayout, ResultLoading } from '../results/result-layout';
import { SearchFacetSummary } from './search-facets';
import type { PrivateSearchOrigin } from './search-parameters';
import {
  cameraForSearch,
  catalogUrl,
  parseMapUrlState,
  searchInArea,
  searchOnlyParameters,
} from '../map/map-state';
import { MarketplaceMapExperience } from '../map/marketplace-map-experience';
import { SaveSearchButton } from '../engagement/save-search-button';
import { EmptyState } from '../../components/ui/feedback';
import { Button } from '../../components/ui/button';

export function SearchResults({
  state,
  onReset,
  selectedId,
  onSelect,
  onNavigate,
}: {
  state: ReturnType<SearchSession['snapshot']>;
  onReset: () => void;
  selectedId?: string | null;
  onSelect?: (listingId: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <section aria-label="Результаты поиска" aria-busy={state.loading}>
      {state.loading && <p role="status">Ищем автомобили…</p>}
      {state.loading && state.items.length === 0 && <ResultLoading />}
      <ListingError error={state.error} />
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="По вашему запросу ничего не найдено"
          action={
            <Button variant="outline" onClick={onReset}>
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
            onNavigate={onNavigate}
          />
        ))}
      </ResultLayout>
    </section>
  );
}
export function SearchScreen() {
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
    () => parseSearchParameters(new URLSearchParams(filterRaw)),
    [filterRaw],
  );
  const parameters = useMemo(
    () => ({ ...parsed.parameters, ...(privateOrigin ?? {}) }),
    [parsed.parameters, privateOrigin],
  );
  const key = serializeSearchParameters(parameters);
  const catalog = useMemo(() => new ListingApi(client), [client]);
  const api = useMemo(() => new SearchClient(client), [client]);
  const session = useMemo(
    () =>
      new SearchSession((parameters, cursor, signal) =>
        api.listings('VEHICLE', parameters, cursor, signal),
      ),
    [api],
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.serverSnapshot,
  );
  useEffect(() => {
    void session.reset(key, parameters);
    return () => session.dispose();
  }, [session, key, parameters]);
  const refresh = () => {
    void session.reset(key, parameters);
  };
  const firstPoint = state.items.find((item) => item.location?.publicPoint)
    ?.location?.publicPoint;
  const camera = cameraForSearch(mapUrl.camera, parameters, firstPoint);
  return (
    <main id="main" className="catalog-page">
      <h1>Каталог автомобилей</h1>
      {parsed.error && (
        <p role="alert">
          {parsed.error} Показан каталог без некорректных фильтров.
        </p>
      )}
      <SearchFilters
        key={filterRaw + (privateOrigin ? ':private' : '')}
        api={catalog}
        parameters={parameters}
        privateOriginActive={Boolean(privateOrigin)}
        onApply={(next, origin) => {
          setPrivateOrigin(origin ?? null);
          router.push(catalogUrl('/cars', next, mapUrl, origin === undefined), {
            scroll: false,
          });
        }}
      />
      <SaveSearchButton
        type="VEHICLE"
        filters={parsed.parameters}
        privateOrigin={Boolean(privateOrigin)}
      />
      <MarketplaceMapExperience
        type="VEHICLE"
        api={api}
        filters={parameters}
        view={mapUrl.view}
        camera={camera}
        items={state.items}
        allowCameraUrl={!privateOrigin}
        onView={(view) =>
          router.push(
            catalogUrl(
              '/cars',
              parsed.parameters,
              { ...mapUrl, view },
              !privateOrigin,
            ),
            { scroll: false },
          )
        }
        onCamera={(nextCamera) => {
          if (navigating.current || window.location.pathname !== '/cars')
            return;
          router.replace(
            catalogUrl(
              '/cars',
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
              '/cars',
              searchInArea(parsed.parameters, bounds),
              mapUrl,
              true,
            ),
            { scroll: false },
          );
        }}
        renderList={(selectedId, onSelect) => (
          <>
            <SearchFacetSummary
              key={key}
              type="VEHICLE"
              api={api}
              parameters={parameters}
            />
            <button disabled={state.loading} onClick={refresh}>
              {state.error ? 'Повторить поиск' : 'Обновить выдачу и фотографии'}
            </button>
            <SearchResults
              state={state}
              selectedId={selectedId}
              onSelect={onSelect}
              onNavigate={() => {
                navigating.current = true;
              }}
              onReset={() => {
                setPrivateOrigin(null);
                router.push('/cars', { scroll: false });
              }}
            />
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
