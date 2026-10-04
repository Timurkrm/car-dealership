'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type {
  SearchClient,
  SearchItem,
  SearchListingType,
} from '../search/search-client';
import type { SearchParameters } from '../search/search-parameters';
import { ListingError } from '../listings/listing-feedback';
import {
  boundsParameter,
  type MapBounds,
  type MapCamera,
  type MarketplaceView,
} from './map-state';
import { MapSession } from './map-session';
import { MarketplaceMap } from './marketplace-map';
import { MapListingPreview } from './map-listing-preview';

export function MarketplaceMapExperience({
  type,
  api,
  filters,
  view,
  camera,
  items,
  allowCameraUrl,
  onView,
  onCamera,
  onSearchArea,
  renderList,
}: {
  type: SearchListingType;
  api: SearchClient;
  filters: SearchParameters;
  view: MarketplaceView;
  camera: MapCamera;
  items: SearchItem[];
  allowCameraUrl: boolean;
  onView: (view: MarketplaceView) => void;
  onCamera: (camera: MapCamera) => void;
  onSearchArea: (bounds: MapBounds) => void;
  renderList: (
    selectedId: string | null,
    select: (listingId: string) => void,
  ) => ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapBounds | null>(null);
  const session = useMemo(
    () =>
      new MapSession((key, signal) => {
        const separator = key.lastIndexOf('|');
        const box = key.slice(0, separator);
        const zoom = Number(key.slice(separator + 1));
        return api.mapListings(type, filters, box, zoom, signal);
      }),
    [api, filters, type],
  );
  const map = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.serverSnapshot,
  );
  useEffect(() => () => session.dispose(), [session]);

  const select = useCallback(
    (listingId: string) => {
      setSelectedId(listingId);
      if (items.some((item) => item.id === listingId)) {
        const element = document.getElementById(`listing-card-${listingId}`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        element?.focus({ preventScroll: true });
      }
    },
    [items],
  );
  const selected = map.features.find(
    (feature) => feature.kind === 'LISTING' && feature.listingId === selectedId,
  );
  const move = useCallback(
    (bounds: MapBounds, nextCamera: MapCamera) => {
      setViewport(bounds);
      session.schedule(
        `${boundsParameter(bounds)}|${nextCamera.zoom.toFixed(2)}`,
      );
      if (allowCameraUrl) onCamera(nextCamera);
    },
    [allowCameraUrl, onCamera, session],
  );

  return (
    <div className={`marketplace-discovery view-${view}`}>
      <div
        className="map-view-switcher"
        role="group"
        aria-label="Режим каталога"
      >
        <button aria-pressed={view === 'list'} onClick={() => onView('list')}>
          Список
        </button>
        <button
          className="view-split-button"
          aria-pressed={view === 'split'}
          onClick={() => onView('split')}
        >
          Список + карта
        </button>
        <button aria-pressed={view === 'map'} onClick={() => onView('map')}>
          Карта
        </button>
      </div>
      <div className="marketplace-discovery-grid">
        <section className="discovery-list-pane" aria-label="Список объявлений">
          {/* List hover/focus updates selection without stealing focus from its controls. */}
          {renderList(selectedId, setSelectedId)}
        </section>
        <section className="discovery-map-pane" aria-label="Карта результатов">
          <div className="map-toolbar">
            <button
              disabled={!viewport}
              onClick={() => viewport && onSearchArea(viewport)}
            >
              Искать в этой области
            </button>
            {map.loading && <span role="status">Обновляем карту…</span>}
            {map.truncated && (
              <span role="status">
                Показана часть объектов. Увеличьте масштаб или сузьте фильтры.
              </span>
            )}
          </div>
          <ListingError error={map.error} />
          {Boolean(map.error) && (
            <button onClick={() => session.retry()}>Повторить карту</button>
          )}
          <MarketplaceMap
            features={map.features}
            camera={camera}
            selectedId={selectedId}
            onSelect={select}
            onMoveEnd={move}
          />
          {selected?.kind === 'LISTING' && (
            <MapListingPreview
              feature={selected}
              onClose={() => setSelectedId(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
