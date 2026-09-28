'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from 'maplibre-gl';
import type { FeatureCollection, Point as GeoJsonPoint } from 'geojson';
import type { MapFeature } from '../search/search-client';
import type { MapBounds, MapCamera } from './map-state';
import { publicMapConfig } from './map-config';

interface MarketplaceMapProps {
  features: MapFeature[];
  camera: MapCamera;
  selectedId: string | null;
  onSelect: (listingId: string) => void;
  onMoveEnd: (bounds: MapBounds, camera: MapCamera) => void;
}

const SOURCE = 'marketplace-features';
const SELECTED_SOURCE = 'marketplace-selected';
const empty: FeatureCollection<GeoJsonPoint> = {
  type: 'FeatureCollection',
  features: [],
};

function normalizeLongitude(value: number) {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && value > 0 ? 180 : normalized;
}

function featureCollection(
  features: MapFeature[],
): FeatureCollection<GeoJsonPoint> {
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates:
          feature.kind === 'CLUSTER'
            ? [feature.center.longitude, feature.center.latitude]
            : [feature.publicPoint.longitude, feature.publicPoint.latitude],
      },
      properties:
        feature.kind === 'CLUSTER'
          ? {
              kind: feature.kind,
              clusterId: feature.clusterId,
              count: feature.count,
            }
          : {
              kind: feature.kind,
              listingId: feature.listingId,
              listingType: feature.type,
            },
    })),
  };
}

export function MarketplaceMap(props: MarketplaceMapProps) {
  const config = useMemo(() => publicMapConfig(), []);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const externalCamera = useRef(props.camera);
  const features = useRef(props.features);
  const callbacks = useRef({
    onSelect: props.onSelect,
    onMoveEnd: props.onMoveEnd,
  });
  const [error, setError] = useState<string | null>(() =>
    config.styleUrl
      ? null
      : 'Карта временно недоступна: не настроен поставщик стиля.',
  );

  useEffect(() => {
    features.current = props.features;
  }, [props.features]);
  useEffect(() => {
    callbacks.current = {
      onSelect: props.onSelect,
      onMoveEnd: props.onMoveEnd,
    };
  }, [props.onMoveEnd, props.onSelect]);

  useEffect(() => {
    if (!container.current || map.current) return;
    if (!config.styleUrl) return;
    const styleUrl = config.styleUrl;
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    void import('maplibre-gl')
      .then((maplibre) => {
        if (disposed || !container.current) return;
        maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
        const instance = new maplibre.Map({
          container: container.current,
          style: styleUrl,
          center: [props.camera.longitude, props.camera.latitude],
          zoom: props.camera.zoom,
          minZoom: 0,
          maxZoom: 22,
          attributionControl: false,
        });
        map.current = instance;
        instance.addControl(new maplibre.NavigationControl(), 'top-right');
        instance.addControl(
          new maplibre.AttributionControl({
            compact: true,
            ...(config.attribution
              ? { customAttribution: config.attribution }
              : {}),
          }),
        );
        instance.on('error', () =>
          setError('Не удалось загрузить карту. Список объявлений доступен.'),
        );
        instance.on('load', () => {
          loaded.current = true;
          instance.addSource(SOURCE, {
            type: 'geojson',
            data: featureCollection(features.current),
          });
          instance.addSource(SELECTED_SOURCE, { type: 'geojson', data: empty });
          instance.addLayer({
            id: 'marketplace-clusters',
            type: 'circle',
            source: SOURCE,
            filter: ['==', ['get', 'kind'], 'CLUSTER'],
            paint: {
              'circle-color': '#174ea6',
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['get', 'count'],
                2,
                18,
                100,
                28,
                1000,
                36,
              ],
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          });
          queueMicrotask(() => instance.fire('moveend'));
          instance.addLayer({
            id: 'marketplace-cluster-count',
            type: 'symbol',
            source: SOURCE,
            filter: ['==', ['get', 'kind'], 'CLUSTER'],
            layout: {
              'text-field': ['to-string', ['get', 'count']],
              'text-size': 13,
            },
            paint: { 'text-color': '#fff' },
          });
          instance.addLayer({
            id: 'marketplace-listings',
            type: 'circle',
            source: SOURCE,
            filter: ['==', ['get', 'kind'], 'LISTING'],
            paint: {
              'circle-color': [
                'match',
                ['get', 'listingType'],
                'PART',
                '#a63d17',
                '#16734a',
              ],
              'circle-radius': 8,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          });
          instance.addLayer({
            id: 'marketplace-selected',
            type: 'circle',
            source: SELECTED_SOURCE,
            paint: {
              'circle-color': 'transparent',
              'circle-radius': 13,
              'circle-stroke-color': '#111827',
              'circle-stroke-width': 4,
            },
          });
        });
        const clickListing = (event: MapLayerMouseEvent) => {
          const listingId = event.features?.[0]?.properties?.listingId;
          if (typeof listingId === 'string')
            callbacks.current.onSelect(listingId);
        };
        const clickCluster = (event: MapLayerMouseEvent) => {
          const clusterId = event.features?.[0]?.properties?.clusterId;
          const cluster = features.current.find(
            (feature) =>
              feature.kind === 'CLUSTER' && feature.clusterId === clusterId,
          );
          if (!cluster || cluster.kind !== 'CLUSTER') return;
          const reduced = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
          ).matches;
          const east =
            cluster.bounds.east < cluster.bounds.west
              ? cluster.bounds.east + 360
              : cluster.bounds.east;
          const pointBounds =
            Math.abs(east - cluster.bounds.west) < 0.00001 &&
            Math.abs(cluster.bounds.north - cluster.bounds.south) < 0.00001;
          if (pointBounds)
            instance.easeTo({
              center: [cluster.center.longitude, cluster.center.latitude],
              zoom: Math.min(22, instance.getZoom() + 2),
              duration: reduced ? 0 : 350,
            });
          else
            instance.fitBounds(
              [
                [cluster.bounds.west, cluster.bounds.south],
                [east, cluster.bounds.north],
              ],
              { padding: 64, maxZoom: 18, duration: reduced ? 0 : 350 },
            );
        };
        instance.on('click', 'marketplace-listings', clickListing);
        instance.on('click', 'marketplace-clusters', clickCluster);
        for (const layer of ['marketplace-listings', 'marketplace-clusters']) {
          instance.on('mouseenter', layer, () => {
            instance.getCanvas().style.cursor = 'pointer';
          });
          instance.on('mouseleave', layer, () => {
            instance.getCanvas().style.cursor = '';
          });
        }
        instance.on('moveend', () => {
          const bounds = instance.getBounds();
          const center = instance.getCenter();
          const span = bounds.getEast() - bounds.getWest();
          callbacks.current.onMoveEnd(
            span >= 360
              ? {
                  west: -180,
                  south: bounds.getSouth(),
                  east: 180,
                  north: bounds.getNorth(),
                }
              : {
                  west: normalizeLongitude(bounds.getWest()),
                  south: Math.max(-90, bounds.getSouth()),
                  east: normalizeLongitude(bounds.getEast()),
                  north: Math.min(90, bounds.getNorth()),
                },
            {
              latitude: center.lat,
              longitude: normalizeLongitude(center.lng),
              zoom: instance.getZoom(),
            },
          );
        });
        resizeObserver = new ResizeObserver(() => instance.resize());
        resizeObserver.observe(container.current);
      })
      .catch(() =>
        setError('Не удалось запустить карту. Список объявлений доступен.'),
      );
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      map.current?.remove();
      map.current = null;
      loaded.current = false;
    };
    // Map instance must survive result and camera updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded.current || !map.current) return;
    (map.current.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(
      featureCollection(props.features),
    );
  }, [props.features]);

  useEffect(() => {
    if (!loaded.current || !map.current) return;
    const selected = props.features.find(
      (feature) =>
        feature.kind === 'LISTING' && feature.listingId === props.selectedId,
    );
    (
      map.current.getSource(SELECTED_SOURCE) as GeoJSONSource | undefined
    )?.setData(selected ? featureCollection([selected]) : empty);
  }, [props.features, props.selectedId]);

  useEffect(() => {
    const instance = map.current;
    if (!loaded.current || !instance) return;
    const previous = externalCamera.current;
    externalCamera.current = props.camera;
    if (
      Math.abs(previous.latitude - props.camera.latitude) < 0.000001 &&
      Math.abs(previous.longitude - props.camera.longitude) < 0.000001 &&
      Math.abs(previous.zoom - props.camera.zoom) < 0.001
    )
      return;
    const center = instance.getCenter();
    if (
      Math.abs(center.lat - props.camera.latitude) < 0.0001 &&
      Math.abs(normalizeLongitude(center.lng) - props.camera.longitude) <
        0.0001 &&
      Math.abs(instance.getZoom() - props.camera.zoom) < 0.01
    )
      return;
    instance.jumpTo({
      center: [props.camera.longitude, props.camera.latitude],
      zoom: props.camera.zoom,
    });
  }, [props.camera]);

  return (
    <section className="map-canvas-shell" aria-label="Карта объявлений">
      {error && (
        <p className="map-provider-error" role="status">
          {error}
        </p>
      )}
      <div
        ref={container}
        className="map-canvas"
        role="application"
        aria-label="Интерактивная карта. Используйте клавиши со стрелками для перемещения и кнопки масштаба."
      />
      <p className="visually-hidden" aria-live="polite">
        На карте {props.features.length} объектов.
      </p>
    </section>
  );
}
