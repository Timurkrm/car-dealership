'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type {
  SearchClient,
  SearchItem,
  SearchListingType,
} from '../search/search-client';
import type { SearchParameters } from '../search/search-parameters';
import { serializeSearchParameters } from '../search/search-parameters';
import { searchErrorMessage } from '../search/search-presentation';
import { Button } from '../../components/ui/button';
import { Alert, ErrorState } from '../../components/ui/feedback';
import {
  boundsParameter,
  viewportChanged,
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
  onCamera,
  onSearchArea,
  onNavigate,
  renderList,
}: {
  type: SearchListingType;
  api: SearchClient;
  filters: SearchParameters;
  view: MarketplaceView;
  camera: MapCamera;
  items: SearchItem[];
  allowCameraUrl: boolean;
  onCamera: (camera: MapCamera) => void;
  onSearchArea: (bounds: MapBounds) => void;
  onNavigate?: () => void;
  renderList: (
    selectedId: string | null,
    select: (listingId: string) => void,
    hoveredId: string | null,
    hover: (listingId: string | null) => void,
  ) => ReactNode;
}) {
  const filterKey = serializeSearchParameters(filters);
  const [selection, setSelection] = useState<{
    key: string;
    id: string;
  } | null>(null);
  const [hover, setHover] = useState<{ key: string; id: string | null } | null>(
    null,
  );
  const [viewport, setViewport] = useState<{
    bounds: MapBounds;
    camera: MapCamera;
  } | null>(null);
  const [anchor, setAnchor] = useState<MapBounds | null>(null);
  const session = useMemo(
    () =>
      new MapSession((key, signal) => {
        const separator = key.lastIndexOf('|');
        return api.mapListings(
          type,
          filters,
          key.slice(0, separator),
          Number(key.slice(separator + 1)),
          signal,
        );
      }),
    [api, filters, type],
  );
  const map = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.serverSnapshot,
  );
  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => {
    if (viewport && view !== 'list')
      session.schedule(
        `${boundsParameter(viewport.bounds)}|${viewport.camera.zoom.toFixed(2)}`,
      );
  }, [session, viewport, view]);
  const exists = (id: string) =>
    items.some((item) => item.id === id) ||
    map.features.some(
      (feature) => feature.kind === 'LISTING' && feature.listingId === id,
    );
  // Clear obsolete interaction state, so returning to an old query/viewport
  // cannot resurrect a selection. The map instance itself remains mounted.
  if (
    selection &&
    (selection.key !== filterKey || (!map.loading && !exists(selection.id)))
  )
    setSelection(null);
  if (
    hover &&
    (hover.key !== filterKey || (hover.id && !map.loading && !exists(hover.id)))
  )
    setHover(null);
  const selectedId =
    selection?.key === filterKey && exists(selection.id) ? selection.id : null;
  const hoveredId =
    hover?.key === filterKey && hover.id && exists(hover.id) ? hover.id : null;
  const select = (id: string) => setSelection({ key: filterKey, id });
  const setHovered = (id: string | null) => setHover({ key: filterKey, id });
  const selectMarker = (id: string) => {
    select(id);
    if (view === 'split' && items.some((item) => item.id === id))
      document.getElementById(`listing-card-${id}`)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'nearest',
      });
  };
  const selected = map.features.find(
    (feature) => feature.kind === 'LISTING' && feature.listingId === selectedId,
  );
  const move = (bounds: MapBounds, nextCamera: MapCamera) => {
    if (view === 'list') return;
    setViewport({ bounds, camera: nextCamera });
    setAnchor((current) => current ?? bounds);
    if (allowCameraUrl) onCamera(nextCamera);
  };
  const pending = Boolean(
    viewport && anchor && viewportChanged(anchor, viewport.bounds),
  );
  return (
    <div className={`marketplace-discovery view-${view}`}>
      <div className="marketplace-discovery-grid">
        <section className="discovery-list-pane" aria-label="Список объявлений">
          {renderList(selectedId, select, hoveredId, setHovered)}
        </section>
        <section className="discovery-map-pane" aria-label="Карта результатов">
          <div className="map-toolbar">
            {pending && (
              <Button
                onClick={() => {
                  if (viewport) {
                    setAnchor(viewport.bounds);
                    onSearchArea(viewport.bounds);
                  }
                }}
              >
                Искать в этой области
              </Button>
            )}
            {map.loading && (
              <span className="map-progress" role="status">
                Обновляем карту…
              </span>
            )}
          </div>
          {Boolean(map.error) && (
            <ErrorState
              title="Карта не обновилась"
              description={searchErrorMessage(map.error)}
              onRetry={() => session.retry()}
            />
          )}
          {map.truncated && (
            <Alert>
              Показана часть объектов. Увеличьте масштаб или сузьте фильтры.
            </Alert>
          )}
          <MarketplaceMap
            active={view !== 'list'}
            features={map.features}
            camera={camera}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onHover={setHovered}
            onSelect={selectMarker}
            onMoveEnd={move}
          />
          {selected?.kind === 'LISTING' && (
            <MapListingPreview
              feature={selected}
              onClose={() => setSelection(null)}
              onNavigate={onNavigate}
            />
          )}
        </section>
      </div>
    </div>
  );
}
