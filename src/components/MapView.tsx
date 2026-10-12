import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  BASEMAPS,
  CANTON_COLORS,
  MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  OVERLAYS,
  SWISS_BOUNDS,
  TILE_BOUNDS,
  type BasemapId,
  type OverlayId,
} from '../lib/config';
import { loadCantons, loadSwitzerland, type CantonFeature } from '../lib/cantons';
import type { LatLng } from '../lib/geo';
import { load, save } from '../lib/storage';
import type { Pin } from '../hooks/usePins';
import type { Position } from '../hooks/useGeolocation';
import { KIND_COLOR, type Connection, type Station } from '../lib/transport';
import { stationEmoji } from './stationIcons';
import type { Area } from '../game/derive';

/** Kreis als Polygon (für Löcher in Flächen) */
function circleRing(lat: number, lng: number, km: number, steps = 72): L.LatLngTuple[] {
  const out: L.LatLngTuple[] = [];
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push([lat + dLat * Math.sin(a), lng + dLng * Math.cos(a)]);
  }
  return out;
}

const WORLD: L.LatLngTuple[] = [
  [40, -5],
  [56, -5],
  [56, 25],
  [40, 25],
];
const AREA_STYLE: L.PolylineOptions = { pane: 'gameMask', interactive: false, stroke: false, fillColor: '#1f1c35', fillOpacity: 0.5 };
const EDGE_STYLE: L.PolylineOptions = { pane: 'gameMask', interactive: false, color: '#f2914f', weight: 3.5, opacity: 1, dashArray: '10 7', lineCap: 'round', fill: false };
/** Spielfeld: Kantone ausserhalb leicht abgedunkelt, Rand weiss */
const FIELD_STYLE: L.PolylineOptions = { pane: 'gameMask', interactive: false, stroke: false, fillColor: '#1f1c35', fillOpacity: 0.38 };
const FIELD_EDGE: L.PolylineOptions = { pane: 'gameMask', interactive: false, color: '#ffffff', weight: 2.5, opacity: 0.9, fill: false };

export interface GamePlayerMarker {
  id: string;
  name: string;
  color: string;
  team: 'seeker' | 'hider';
  lat: number;
  lng: number;
  kind: 'live' | 'ping';
  /** z.B. "vor 3 Min" bei Pings */
  ago?: string;
  caught: boolean;
  online: boolean;
}

export interface MapViewProps {
  basemap: BasemapId;
  overlays: Record<OverlayId, boolean>;
  pins: Pin[];
  position: Position | null;
  follow: boolean;
  selection: LatLng | null;
  selectedCantonId: number | null;
  stations: Station[];
  /** Gewählte ÖV-Verbindung, die als Linie gezeichnet wird */
  route: Connection | null;
  /** Mitspieler im laufenden Spiel */
  gamePlayers: GamePlayerMarker[];
  /** Für die Fänger: Gebiete, die durch Power-ups ausgeschlossen sind */
  gameAreas: Area[];
  /** Für die Verstecker: das eigene Versteck */
  gameSpot: LatLng | null;
  /** Beim Wählen des Verstecks auf der Karte: erlaubter Bereich um den GPS-Standort */
  pickCircle?: { lat: number; lng: number; radius: number } | null;
  onBasemapError?: () => void;
  onReady: (map: L.Map) => void;
  onTap: (p: LatLng, canton: CantonFeature | null) => void;
  onLongPress: (p: LatLng) => void;
  onPinClick: (pin: Pin) => void;
  onStationClick: (station: Station) => void;
  onUserPan: () => void;
}

interface SavedView {
  lat: number;
  lng: number;
  zoom: number;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pinIcon(pin: Pin): L.DivIcon {
  return L.divIcon({
    className: 'pin-marker',
    html: `<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">
        <path d="M16 41S2 26.5 2 16a14 14 0 0 1 28 0c0 10.5-14 25-14 25Z" fill="${pin.color}" stroke="#fff" stroke-width="2.5"/>
        <circle cx="16" cy="16" r="5.5" fill="#fff"/>
      </svg><span class="pin-label">${escapeHtml(pin.name)}</span>`,
    iconSize: [32, 42],
    iconAnchor: [16, 41],
  });
}

/** Ebenen der swisstopo-Vektorkarte, die in der App stören */
const HIDDEN_VECTOR_LAYERS = ['place_country'];

/** Farbe der Fläche ausserhalb der Schweiz (auch Hintergrund der Karte) */
const MASK_COLOR = '#2a2741';

const selectionIcon = L.divIcon({
  className: 'selection-marker',
  html: '<span class="selection-dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function cantonStyle(f: CantonFeature | undefined, selectedId: number | null): L.PathOptions {
  const color = CANTON_COLORS[(f?.properties.color ?? 0) % CANTON_COLORS.length];
  const selected = f?.properties.id === selectedId;
  return {
    className: 'canton-shape',
    color: selected ? '#f2914f' : '#1f1c35',
    weight: selected ? 4 : 1.1,
    opacity: selected ? 1 : 0.5,
    fillColor: color,
    fillOpacity: selected ? 0.22 : 0.08,
  };
}

/** Kartenausschnitt so setzen, dass auch die ganze Schweiz auf kleine Bildschirme passt */
function initialView(map: L.Map) {
  const saved = load<SavedView | null>('view.v1', null);
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.zoom)) {
    map.setView([saved.lat, saved.lng], saved.zoom);
  } else {
    map.fitBounds(SWISS_BOUNDS, { padding: [12, 12] });
  }
}

export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const baseLayerRef = useRef<L.Layer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const gameLayerRef = useRef<L.LayerGroup | null>(null);
  const areaLayerRef = useRef<L.LayerGroup | null>(null);
  const spotLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayersRef = useRef<Partial<Record<OverlayId, L.Layer>>>({});
  const cantonLayerRef = useRef<L.GeoJSON | null>(null);
  const cantonLabelsRef = useRef<L.LayerGroup | null>(null);
  const pinLayerRef = useRef<L.LayerGroup | null>(null);
  const stationLayerRef = useRef<L.LayerGroup | null>(null);
  const positionRef = useRef<{ dot: L.Marker; circle: L.Circle } | null>(null);
  const selectionRef = useRef<L.Marker | null>(null);
  const pickCircleRef = useRef<L.Circle | null>(null);
  const hadFixRef = useRef(false);
  const prevFollowRef = useRef(false);

  // Karte einmalig erzeugen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomSnap: 0.5,
      maxBounds: MAX_BOUNDS,
      maxBoundsViscosity: 0.85,
      zoomControl: false,
      tapHold: true,
      inertia: true,
    });
    mapRef.current = map;
    map.attributionControl.setPrefix(false);
    map.attributionControl.setPosition('bottomright');
    L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 110 }).addTo(map);
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      L.control.zoom({ position: 'bottomright', zoomInTitle: 'Hineinzoomen', zoomOutTitle: 'Herauszoomen' }).addTo(map);
    }

    map.createPane('mask').style.zIndex = '350';
    const mask = map.getPane('mask')!;
    mask.style.pointerEvents = 'none';
    map.createPane('labels').style.zIndex = '450';
    map.getPane('labels')!.style.pointerEvents = 'none';
    map.createPane('gameMask').style.zIndex = '360';
    map.getPane('gameMask')!.style.pointerEvents = 'none';
    map.createPane('route').style.zIndex = '470';
    map.getPane('route')!.style.pointerEvents = 'none';

    initialView(map);

    // Ausserhalb der Schweiz abdunkeln – weit herausgezoomt fast deckend,
    // damit fehlende Kacheln am Rand der swisstopo-Abdeckung nicht auffallen
    let maskLayer: L.Polygon | null = null;
    const maskOpacity = (z: number) => (z < 8 ? 1 : z < 10 ? 0.5 : 0.22);
    const updateZoomBand = () => {
      const z = map.getZoom();
      el.dataset.zoomBand = z < 8 ? 'low' : z < 10 ? 'mid' : 'high';
      maskLayer?.setStyle({ fillOpacity: maskOpacity(z) });
    };
    updateZoomBand();
    map.on('zoomend', updateZoomBand);
    map.on('moveend', () => {
      const c = map.getCenter();
      save('view.v1', { lat: c.lat, lng: c.lng, zoom: map.getZoom() } satisfies SavedView);
    });
    map.on('dragstart', () => propsRef.current.onUserPan());
    map.on('click', (e: L.LeafletMouseEvent) => propsRef.current.onTap(e.latlng, null));
    map.on('contextmenu', (e: L.LeafletMouseEvent) => propsRef.current.onLongPress(e.latlng));

    // Schweiz hervorheben: Umgebung abdunkeln, Landesgrenze in Rot
    let cancelled = false;
    loadSwitzerland()
      .then((country) => {
        if (cancelled) return;
        const polys = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
        const toLatLngs = (ring: GeoJSON.Position[]) => ring.map(([lng, lat]) => [lat!, lng!] as L.LatLngTuple);
        const world: L.LatLngTuple[] = [
          [-85, -180],
          [85, -180],
          [85, 180],
          [-85, 180],
        ];
        const holes = polys.map((rings) => toLatLngs(rings[0]!));
        maskLayer = L.polygon([world, ...holes], {
          pane: 'mask',
          interactive: false,
          stroke: false,
          fillColor: MASK_COLOR,
          fillOpacity: maskOpacity(map.getZoom()),
        }).addTo(map);
        L.geoJSON(country, {
          pane: 'mask',
          interactive: false,
          style: { color: '#ffffff', weight: 3, opacity: 0.95, fill: false },
        }).addTo(map);
      })
      .catch(() => undefined);

    propsRef.current.onReady(map);
    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      overlayLayersRef.current = {};
      cantonLayerRef.current = null;
      cantonLabelsRef.current = null;
      pinLayerRef.current = null;
      stationLayerRef.current = null;
      routeLayerRef.current = null;
      gameLayerRef.current = null;
      areaLayerRef.current = null;
      spotLayerRef.current = null;
      positionRef.current = null;
      selectionRef.current = null;
      hadFixRef.current = false;
    };
  }, []);

  // Grundkarte: Vektorkarte (MapLibre, wird erst bei Bedarf geladen) oder Rasterkacheln
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const def = BASEMAPS.find((b) => b.id === props.basemap) ?? BASEMAPS[0]!;
    let cancelled = false;
    const swap = (layer: L.Layer) => {
      if (cancelled || !mapRef.current) return;
      layer.addTo(map);
      baseLayerRef.current?.remove();
      baseLayerRef.current = layer;
    };
    if (def.kind === 'raster') {
      swap(
        L.tileLayer(def.url, {
          attribution: def.attribution,
          maxNativeZoom: def.maxNativeZoom,
          maxZoom: MAX_ZOOM,
          zIndex: 1,
          bounds: TILE_BOUNDS,
          crossOrigin: true,
          keepBuffer: 3,
        }),
      );
    } else {
      Promise.all([
        import('maplibre-gl'),
        // MapLibre findet seinen Hintergrund-Worker nach dem Bündeln nicht von selbst
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
        import('@maplibre/maplibre-gl-leaflet'),
        import('maplibre-gl/dist/maplibre-gl.css'),
      ])
        .then(([maplibre, worker, plugin]) => {
          if (cancelled) return;
          maplibre.setWorkerUrl(worker.default);
          const layer = plugin.maplibreGL({
            style: def.style,
            attribution: def.attribution,
            attributionControl: false,
            interactive: false,
            maxZoom: MAX_ZOOM,
          } as Parameters<typeof plugin.maplibreGL>[0] & { attribution: string });
          swap(layer);
          // Landesnamen ("SCHWEIZ/SUISSE/…") überdecken sonst die Kantonskürzel
          const gl = layer.getMaplibreMap();
          gl.once('load', () => {
            for (const id of HIDDEN_VECTOR_LAYERS) if (gl.getLayer(id)) gl.setLayoutProperty(id, 'visibility', 'none');
          });
        })
        .catch(() => !cancelled && propsRef.current.onBasemapError?.());
    }
    return () => {
      cancelled = true;
    };
  }, [props.basemap]);

  // Kachel-Overlays (ÖV, Wanderwege)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    OVERLAYS.forEach((def, i) => {
      if (!def.tiles) return;
      const existing = overlayLayersRef.current[def.id];
      const wanted = props.overlays[def.id];
      if (wanted && !existing) {
        overlayLayersRef.current[def.id] = L.tileLayer(def.tiles.url, {
          attribution: def.tiles.attribution,
          maxNativeZoom: def.tiles.maxNativeZoom,
          maxZoom: MAX_ZOOM,
          zIndex: 10 + i,
          bounds: TILE_BOUNDS,
          crossOrigin: true,
        }).addTo(map);
      } else if (!wanted && existing) {
        existing.remove();
        delete overlayLayersRef.current[def.id];
      }
    });
  }, [props.overlays]);

  // Kantone (Vektor, interaktiv)
  const showCantons = props.overlays.cantons;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showCantons) {
      cantonLayerRef.current?.remove();
      cantonLabelsRef.current?.remove();
      return;
    }
    if (cantonLayerRef.current) {
      cantonLayerRef.current.addTo(map);
      cantonLabelsRef.current?.addTo(map);
      return;
    }
    let cancelled = false;
    loadCantons()
      .then((data) => {
        if (cancelled || !mapRef.current) return;
        const layer = L.geoJSON(data, {
          style: (f) => cantonStyle(f as CantonFeature, propsRef.current.selectedCantonId),
          onEachFeature: (feature, l) => {
            l.on('click', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e);
              propsRef.current.onTap(e.latlng, feature as CantonFeature);
            });
          },
        });
        const labels = L.layerGroup(
          data.features.map((f) =>
            L.marker([f.properties.label[1], f.properties.label[0]], {
              pane: 'labels',
              interactive: false,
              keyboard: false,
              icon: L.divIcon({
                className: 'canton-label',
                html: `<span class="abbr">${f.properties.abbr}</span><span class="name">${escapeHtml(f.properties.name)}</span>`,
                iconSize: [0, 0],
              }),
            }),
          ),
        );
        cantonLayerRef.current = layer.addTo(map);
        cantonLabelsRef.current = labels.addTo(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [showCantons]);

  // Hervorhebung des gewählten Kantons
  useEffect(() => {
    const layer = cantonLayerRef.current;
    if (!layer) return;
    layer.setStyle((f) => cantonStyle(f as CantonFeature, props.selectedCantonId));
    if (props.selectedCantonId !== null) {
      layer.eachLayer((l) => {
        const f = (l as L.GeoJSON).feature as CantonFeature | undefined;
        if (f?.properties.id === props.selectedCantonId) (l as L.Path).bringToFront();
      });
    }
  }, [props.selectedCantonId]);

  // Pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pinLayerRef.current ??= L.layerGroup().addTo(map);
    const group = pinLayerRef.current;
    group.clearLayers();
    for (const pin of props.pins) {
      L.marker([pin.lat, pin.lng], { icon: pinIcon(pin), title: pin.name, riseOnHover: true })
        .on('click', () => propsRef.current.onPinClick(pin))
        .addTo(group);
    }
  }, [props.pins]);

  // Haltestellen in der Nähe
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stationLayerRef.current ??= L.layerGroup().addTo(map);
    const group = stationLayerRef.current;
    group.clearLayers();
    for (const s of props.stations) {
      L.marker([s.lat, s.lng], {
        title: s.name,
        icon: L.divIcon({
          className: 'station-marker',
          html: `<span>${stationEmoji(s.icon)}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      })
        .on('click', () => propsRef.current.onStationClick(s))
        .addTo(group);
    }
  }, [props.stations]);

  // Mitspieler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    gameLayerRef.current ??= L.layerGroup().addTo(map);
    const group = gameLayerRef.current;
    group.clearLayers();
    for (const p of props.gamePlayers) {
      const initial = escapeHtml((p.name.trim()[0] ?? '?').toUpperCase());
      const label = escapeHtml(p.name) + (p.ago ? ` · ${escapeHtml(p.ago)}` : '');
      L.marker([p.lat, p.lng], {
        interactive: false,
        keyboard: false,
        zIndexOffset: p.team === 'seeker' ? 800 : 900,
        icon: L.divIcon({
          className: `gp-marker ${p.team} ${p.kind} ${p.caught ? 'caught' : ''} ${p.online ? '' : 'offline'}`,
          html: `<span class="gp-dot" style="background:${p.color}">${initial}</span><span class="gp-label">${label}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      }).addTo(group);
    }
  }, [props.gamePlayers]);

  // Ausgeschlossene Gebiete (Fänger)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    areaLayerRef.current ??= L.layerGroup().addTo(map);
    const group = areaLayerRef.current;
    group.clearLayers();
    let cancelled = false;
    for (const a of props.gameAreas) {
      if (a.kind === 'circle') {
        const ring = circleRing(a.lat, a.lng, a.km);
        L.polygon(a.inside ? [WORLD, ring] : [ring], AREA_STYLE).addTo(group);
        L.polygon([ring], EDGE_STYLE).addTo(group);
      } else if (a.kind === 'half') {
        const [s0, n0, w0, e0] = [40, 56, -5, 25];
        const rect: L.LatLngTuple[] =
          a.side === 'north'
            ? [[s0, w0], [a.lat, w0], [a.lat, e0], [s0, e0]]
            : a.side === 'south'
              ? [[a.lat, w0], [n0, w0], [n0, e0], [a.lat, e0]]
              : a.side === 'east'
                ? [[s0, w0], [n0, w0], [n0, a.lng], [s0, a.lng]]
                : [[s0, a.lng], [n0, a.lng], [n0, e0], [s0, e0]];
        L.polygon(rect, AREA_STYLE).addTo(group);
        const line: L.LatLngTuple[] = a.axis === 'ns' ? [[a.lat, w0], [a.lat, e0]] : [[s0, a.lng], [n0, a.lng]];
        L.polyline(line, EDGE_STYLE).addTo(group);
      } else if (a.kind === 'bisector') {
        // Mittelsenkrechte zwischen Start und Messung (lokal flach gerechnet)
        const k = Math.cos((((a.a.lat + a.b.lat) / 2) * Math.PI) / 180);
        const [ax, ay, bx, by] = [a.a.lng * k, a.a.lat, a.b.lng * k, a.b.lat];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const [dx, dy] = [(bx - ax) / len, (by - ay) / len];
        const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
        const [px, py] = [-dy, dx];
        // Ausgeschlossen ist die Seite weg vom näheren Punkt
        const [sx, sy] = a.closer === 'b' ? [-dx, -dy] : [dx, dy];
        const big = 12;
        const pts: [number, number][] = [
          [mx + px * big, my + py * big],
          [mx - px * big, my - py * big],
          [mx - px * big + sx * big, my - py * big + sy * big],
          [mx + px * big + sx * big, my + py * big + sy * big],
        ];
        const ll = pts.map(([x, y]) => [y, x / k] as L.LatLngTuple);
        L.polygon(ll, AREA_STYLE).addTo(group);
        L.polyline([ll[0]!, ll[1]!], EDGE_STYLE).addTo(group);
      } else if (a.kind === 'cantons') {
        loadCantons()
          .then((data) => {
            if (cancelled) return;
            const holes: L.LatLngTuple[][] = [];
            for (const f of data.features) {
              if (!a.abbrs.includes(f.properties.abbr)) continue;
              const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
              for (const rings of polys) holes.push(rings[0]!.map(([lng, lat]) => [lat!, lng!] as L.LatLngTuple));
            }
            if (!holes.length) return;
            L.polygon([WORLD, ...holes], FIELD_STYLE).addTo(group);
            for (const h of holes) L.polygon([h], FIELD_EDGE).addTo(group);
          })
          .catch(() => undefined);
      } else if (a.kind === 'canton') {
        loadCantons()
          .then((data) => {
            if (cancelled) return;
            const f = data.features.find((x) => x.properties.abbr === a.abbr);
            if (!f) return;
            const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
            const holes = polys.map((rings) => rings[0]!.map(([lng, lat]) => [lat!, lng!] as L.LatLngTuple));
            L.polygon([WORLD, ...holes], AREA_STYLE).addTo(group);
            for (const h of holes) L.polygon([h], EDGE_STYLE).addTo(group);
          })
          .catch(() => undefined);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [props.gameAreas]);

  // Eigenes Versteck (Verstecker)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    spotLayerRef.current ??= L.layerGroup().addTo(map);
    const group = spotLayerRef.current;
    group.clearLayers();
    if (!props.gameSpot) return;
    L.marker(props.gameSpot, {
      interactive: false,
      keyboard: false,
      zIndexOffset: 700,
      icon: L.divIcon({ className: 'spot-marker', html: '<span class="spot-pulse"></span><span class="spot-icon">🏠</span><span class="spot-label">Versteck</span>', iconSize: [44, 44], iconAnchor: [22, 22] }),
    }).addTo(group);
  }, [props.gameSpot?.lat, props.gameSpot?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gewählte ÖV-Verbindung
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeLayerRef.current ??= L.layerGroup().addTo(map);
    const group = routeLayerRef.current;
    group.clearLayers();
    const c = props.route;
    if (!c) return;
    const ll = (p: { lat: number | null; lng: number | null }) =>
      p.lat !== null && p.lng !== null ? L.latLng(p.lat, p.lng) : null;
    for (const leg of c.legs) {
      const pts = [leg.from, ...leg.stops, leg.to].map(ll).filter((p): p is L.LatLng => p !== null);
      if (pts.length < 2) continue;
      if (leg.kind === 'walk') {
        L.polyline(pts, { pane: 'route', color: '#4b5563', weight: 4, opacity: 0.9, dashArray: '2 8', lineCap: 'round' }).addTo(group);
      } else {
        const color = (leg.color ?? KIND_COLOR[leg.kind]).bg;
        L.polyline(pts, { pane: 'route', color: '#ffffff', weight: 10, opacity: 0.95, lineJoin: 'round' }).addTo(group);
        L.polyline(pts, { pane: 'route', color, weight: 6, opacity: 1, lineJoin: 'round' }).addTo(group);
        for (const stop of leg.stops) {
          const p = ll(stop);
          if (p) L.circleMarker(p, { pane: 'route', radius: 3, color, weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(group);
        }
      }
    }
    // Umstiege, Start und Ziel
    c.legs.forEach((leg, i) => {
      const p = ll(leg.from);
      if (!p) return;
      const start = i === 0;
      L.circleMarker(p, {
        pane: 'route',
        radius: start ? 8 : 6,
        color: start ? '#16a34a' : '#111827',
        weight: 3,
        fillColor: '#fff',
        fillOpacity: 1,
      }).addTo(group);
    });
    const end = ll(c.legs[c.legs.length - 1]!.to);
    if (end) L.circleMarker(end, { pane: 'route', radius: 8, color: '#D52B1E', weight: 3, fillColor: '#D52B1E', fillOpacity: 1 }).addTo(group);
  }, [props.route]);

  // Erlaubter Bereich beim Wählen des Verstecks
  const pc = props.pickCircle;
  useEffect(() => {
    const map = mapRef.current;
    pickCircleRef.current?.remove();
    pickCircleRef.current = null;
    if (!map || !pc) return;
    pickCircleRef.current = L.circle([pc.lat, pc.lng], {
      radius: pc.radius,
      color: '#f2914f',
      weight: 3,
      dashArray: '8 7',
      fillColor: '#f9b07e',
      fillOpacity: 0.14,
      interactive: false,
    }).addTo(map);
  }, [pc?.lat, pc?.lng, pc?.radius]);

  // Markierter Punkt
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.selection) {
      selectionRef.current?.remove();
      selectionRef.current = null;
      return;
    }
    if (selectionRef.current) selectionRef.current.setLatLng(props.selection);
    else selectionRef.current = L.marker(props.selection, { icon: selectionIcon, interactive: false, keyboard: false }).addTo(map);
  }, [props.selection]);

  // Eigener Standort
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pos = props.position;
    if (!pos) {
      positionRef.current?.dot.remove();
      positionRef.current?.circle.remove();
      positionRef.current = null;
      hadFixRef.current = false;
      prevFollowRef.current = false;
      return;
    }
    const latlng = L.latLng(pos.lat, pos.lng);
    const heading = pos.heading !== null && Number.isFinite(pos.heading) && (pos.speed ?? 0) > 0.5 ? pos.heading : null;
    const html = `<span class="me-pulse"></span>${
      heading !== null ? `<span class="me-heading" style="transform:rotate(${heading}deg)"></span>` : ''
    }<span class="me-dot"></span>`;
    if (!positionRef.current) {
      const circle = L.circle(latlng, {
        radius: pos.accuracy,
        interactive: false,
        color: '#2563eb',
        weight: 1,
        opacity: 0.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
      }).addTo(map);
      const dot = L.marker(latlng, {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000,
        icon: L.divIcon({ className: 'me-marker', html, iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(map);
      positionRef.current = { dot, circle };
    } else {
      positionRef.current.circle.setLatLng(latlng).setRadius(pos.accuracy);
      positionRef.current.dot.setLatLng(latlng);
      const el = positionRef.current.dot.getElement();
      if (el) el.innerHTML = html;
    }
    if (props.follow) {
      // Erster Fix oder "Folgen" frisch eingeschaltet: hinfliegen, danach nur sanft mitschieben
      if (!hadFixRef.current || !prevFollowRef.current) map.flyTo(latlng, Math.max(Math.round(map.getZoom()), 15), { duration: 1.2 });
      else map.panTo(latlng, { animate: true });
    }
    hadFixRef.current = true;
    prevFollowRef.current = props.follow;
  }, [props.position, props.follow]);

  return <div ref={containerRef} className="map" role="application" aria-label="Karte der Schweiz" />;
}
