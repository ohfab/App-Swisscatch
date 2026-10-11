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
import type { Station } from '../lib/transport';
import { stationEmoji } from './stationIcons';

export interface MapViewProps {
  basemap: BasemapId;
  overlays: Record<OverlayId, boolean>;
  pins: Pin[];
  position: Position | null;
  follow: boolean;
  selection: LatLng | null;
  selectedCantonId: number | null;
  stations: Station[];
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

/** Farbe der Fläche ausserhalb der Schweiz (auch Hintergrund der Karte) */
const MASK_COLOR = '#4a515c';

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
    color: selected ? '#D52B1E' : '#5b4636',
    weight: selected ? 3.5 : 1.2,
    opacity: selected ? 1 : 0.7,
    fillColor: color,
    fillOpacity: selected ? 0.32 : 0.14,
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

  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayersRef = useRef<Partial<Record<OverlayId, L.Layer>>>({});
  const cantonLayerRef = useRef<L.GeoJSON | null>(null);
  const cantonLabelsRef = useRef<L.LayerGroup | null>(null);
  const pinLayerRef = useRef<L.LayerGroup | null>(null);
  const stationLayerRef = useRef<L.LayerGroup | null>(null);
  const positionRef = useRef<{ dot: L.Marker; circle: L.Circle } | null>(null);
  const selectionRef = useRef<L.Marker | null>(null);
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

    initialView(map);

    // Ausserhalb der Schweiz abdunkeln – weit herausgezoomt fast deckend,
    // damit fehlende Kacheln am Rand der swisstopo-Abdeckung nicht auffallen
    let maskLayer: L.Polygon | null = null;
    const maskOpacity = (z: number) => (z < 8 ? 1 : z < 10 ? 0.55 : 0.3);
    const updateZoomBand = () => {
      const z = map.getZoom();
      el.dataset.zoomBand = z < 8 ? 'low' : z < 12 ? 'mid' : 'high';
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
          style: { color: '#D52B1E', weight: 2.5, opacity: 0.9, fill: false },
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
      positionRef.current = null;
      selectionRef.current = null;
      hadFixRef.current = false;
    };
  }, []);

  // Grundkarte
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const def = BASEMAPS.find((b) => b.id === props.basemap) ?? BASEMAPS[0]!;
    const layer = L.tileLayer(def.url, {
      attribution: def.attribution,
      maxNativeZoom: def.maxNativeZoom,
      maxZoom: MAX_ZOOM,
      zIndex: 1,
      bounds: TILE_BOUNDS,
      crossOrigin: true,
      keepBuffer: 3,
    }).addTo(map);
    baseLayerRef.current?.remove();
    baseLayerRef.current = layer;
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
