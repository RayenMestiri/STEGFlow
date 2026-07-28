import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  LngLatLike,
  StyleSpecification,
} from 'maplibre-gl';

export type StegCoordinates = [longitude: number, latitude: number];
export type StegMarkerTone = 'team' | 'incident' | 'outage' | 'home';

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openStreetMap',
      type: 'raster',
      source: 'openStreetMap',
      paint: {
        'raster-saturation': -0.15,
        'raster-contrast': 0.05,
      },
    },
  ],
};

const MARKER_COLORS: Record<StegMarkerTone, string> = {
  team: '#0875b1',
  incident: '#e7282e',
  outage: '#e69b28',
  home: '#0b8a65',
};

const MARKER_SYMBOLS: Record<StegMarkerTone, string> = {
  team: 'T',
  incident: '!',
  outage: '↯',
  home: '⌂',
};

export function supportsStegMap(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof window.WebGL2RenderingContext === 'undefined'
  ) {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function whenStegMapReady(
  map: MapLibreMap,
  callback: () => void,
): void {
  let completed = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (completed) return;
    completed = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    map.off('styledata', handleStyleData);
    callback();
  };
  const handleStyleData = () => {
    if (map.isStyleLoaded()) finish();
  };

  if (map.loaded() || map.isStyleLoaded()) {
    queueMicrotask(finish);
    return;
  }
  map.once('load', finish);
  map.on('styledata', handleStyleData);
  fallbackTimer = setTimeout(finish, 3_000);
}

export async function createStegMap(
  container: HTMLElement,
  center: StegCoordinates = [10.1815, 36.826],
  zoom = 12.4,
): Promise<MapLibreMap> {
  const { Map: MapLibre } = await import('maplibre-gl');
  const map = new MapLibre({
    container,
    style: MAP_STYLE,
    center: center as LngLatLike,
    zoom,
    minZoom: 4,
    maxZoom: 19,
    attributionControl: {
      compact: true,
      customAttribution: 'STEGFlow Cartographie',
    },
  });
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        // map container destroyed
      }
    });
    observer.observe(container);
  }

  return map;
}

export async function addStegMarker(
  map: MapLibreMap,
  coordinates: StegCoordinates,
  options: {
    tone: StegMarkerTone;
    label: string;
    detail?: string;
    showLabel?: boolean;
  },
): Promise<Marker> {
  const { Marker: MapMarker, Popup: MapPopup } = await import('maplibre-gl');
  const element = document.createElement('button');
  element.type = 'button';
  element.setAttribute('aria-label', options.label);
  element.style.cssText = [
    'position:relative',
    'width:38px',
    'height:38px',
    'display:grid',
    'place-items:center',
    'padding:0',
    'color:#fff',
    `background:${MARKER_COLORS[options.tone]}`,
    'border:4px solid rgba(255,255,255,.96)',
    'border-radius:50% 50% 50% 9px',
    'box-shadow:0 8px 20px rgba(7,42,62,.28)',
    'font:800 14px "Manrope Variable",sans-serif',
    'cursor:pointer',
  ].join(';');
  element.textContent = MARKER_SYMBOLS[options.tone];

  if (options.showLabel !== false) {
    const label = document.createElement('span');
    label.textContent = options.label;
    label.style.cssText = [
      'position:absolute',
      'top:37px',
      'left:18px',
      'width:max-content',
      'max-width:180px',
      'padding:5px 8px',
      'color:#173744',
      'background:rgba(255,255,255,.96)',
      'border:1px solid rgba(8,106,166,.14)',
      'border-radius:7px',
      'box-shadow:0 6px 18px rgba(7,42,62,.12)',
      'font:700 11px "Manrope Variable",sans-serif',
      'line-height:1.2',
      'white-space:nowrap',
      'pointer-events:none',
    ].join(';');
    element.append(label);
  }

  const popupContent = document.createElement('div');
  popupContent.style.cssText =
    'min-width:170px;padding:3px 2px;font-family:"Manrope Variable",sans-serif;color:#173744';
  const popupTitle = document.createElement('strong');
  popupTitle.textContent = options.label;
  popupTitle.style.cssText = 'display:block;font-size:13px';
  popupContent.append(popupTitle);
  if (options.detail) {
    const popupDetail = document.createElement('span');
    popupDetail.textContent = options.detail;
    popupDetail.style.cssText =
      'display:block;margin-top:3px;color:#667b86;font-size:11px;line-height:1.4';
    popupContent.append(popupDetail);
  }

  return new MapMarker({ element, anchor: 'bottom' })
    .setLngLat(coordinates)
    .setPopup(
      new MapPopup({ offset: 24, closeButton: false }).setDOMContent(popupContent),
    )
    .addTo(map);
}

export function drawStegRoute(
  map: MapLibreMap,
  id: string,
  from: StegCoordinates,
  to: StegCoordinates,
): void {
  const sourceId = `${id}-source`;
  const layerId = `${id}-line`;
  const data = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: [from, to],
    },
  };

  const render = () => {
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#0a83c4',
        'line-width': 5,
        'line-opacity': 0.9,
        'line-dasharray': [1.4, 1.2],
      },
    });
  };

  if (map.loaded() || map.isStyleLoaded()) render();
  else map.once('load', render);
}

export function removeStegRoute(map: MapLibreMap, id: string): void {
  const sourceId = `${id}-source`;
  const layerId = `${id}-line`;
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function fitStegMap(
  map: MapLibreMap,
  coordinates: StegCoordinates[],
  padding = 72,
): void {
  if (!coordinates || !coordinates.length) return;
  const validCoords = coordinates.filter(
    (c) => Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1]),
  );
  if (!validCoords.length) return;

  const longitudes = validCoords.map(([longitude]) => longitude);
  const latitudes = validCoords.map(([, latitude]) => latitude);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);

  if (Math.abs(maxLng - minLng) < 0.0001 && Math.abs(maxLat - minLat) < 0.0001) {
    map.flyTo({ center: [minLng, minLat], zoom: 14.2, duration: 500 });
    return;
  }

  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding, maxZoom: 15.5, duration: 600 },
  );
}

/**
 * Marqueur déplaçable utilisé pour choisir une adresse : l'utilisateur peut
 * cliquer sur la carte, faire glisser l'épingle ou se géolocaliser.
 */
export async function createStegPinMarker(
  map: MapLibreMap,
  coordinates: StegCoordinates,
  onMove: (coordinates: StegCoordinates) => void,
): Promise<Marker> {
  const { Marker: MapMarker } = await import('maplibre-gl');
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'Position sélectionnée');
  element.style.cssText = [
    'width:34px',
    'height:34px',
    'display:grid',
    'place-items:center',
    'color:#fff',
    `background:${MARKER_COLORS.home}`,
    'border:4px solid rgba(255,255,255,.96)',
    'border-radius:50% 50% 50% 8px',
    'box-shadow:0 10px 24px rgba(7,42,62,.32)',
    'transform:rotate(-45deg)',
    'cursor:grab',
  ].join(';');

  const glyph = document.createElement('span');
  glyph.textContent = MARKER_SYMBOLS.home;
  glyph.style.cssText = 'transform:rotate(45deg);font:800 14px "Manrope Variable",sans-serif';
  element.append(glyph);

  const marker = new MapMarker({ element, draggable: true, anchor: 'bottom' })
    .setLngLat(coordinates)
    .addTo(map);

  marker.on('dragend', () => {
    const { lng, lat } = marker.getLngLat();
    onMove([lng, lat]);
  });
  map.on('click', (event) => {
    const next: StegCoordinates = [event.lngLat.lng, event.lngLat.lat];
    marker.setLngLat(next);
    onMove(next);
  });

  return marker;
}
