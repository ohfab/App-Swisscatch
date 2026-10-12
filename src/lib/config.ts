import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';

const WMTS = 'https://wmts.geo.admin.ch/1.0.0';
const SWISSTOPO_ATTR = '<a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">© swisstopo</a>';

export type BasemapId = 'strassen' | 'luftbild' | 'farbe' | 'winter';
export type OverlayId = 'cantons' | 'transit' | 'hiking';

export interface TileDef {
  url: string;
  attribution: string;
  maxNativeZoom: number;
}

const VECTOR_STYLES = 'https://vectortiles.geo.admin.ch/styles';

interface BasemapBase {
  id: BasemapId;
  label: string;
  /** Farbe der Vorschau-Kachel im Ebenen-Menü */
  swatch: string;
}

/** Vektorkarte (MapLibre): scharf in jeder Zoomstufe, mit Strassen, Gebäuden, ÖV und POIs */
export interface VectorBasemap extends BasemapBase {
  kind: 'vector';
  style: string;
  attribution: string;
}

/** Klassische Rasterkacheln */
export interface RasterBasemap extends BasemapBase, TileDef {
  kind: 'raster';
}

export type BasemapDef = VectorBasemap | RasterBasemap;

export const DEFAULT_BASEMAP: BasemapId = 'strassen';

export const BASEMAPS: BasemapDef[] = [
  {
    id: 'strassen',
    kind: 'vector',
    label: 'Strassen',
    style: `${VECTOR_STYLES}/ch.swisstopo.basemap.vt/style.json`,
    attribution: SWISSTOPO_ATTR,
    swatch: 'linear-gradient(135deg,#f4f2ee 0%,#f4f2ee 38%,#ffd36b 40%,#ffd36b 47%,#f4f2ee 49%,#cfe6c3 75%,#a9d3f0 100%)',
  },
  {
    id: 'luftbild',
    kind: 'vector',
    label: 'Luftbild',
    style: `${VECTOR_STYLES}/ch.swisstopo.imagerybasemap.vt/style.json`,
    attribution: SWISSTOPO_ATTR,
    swatch: 'linear-gradient(135deg,#5b6b3c 0%,#3f5130 45%,#f2f2f2 47%,#f2f2f2 50%,#3f5130 52%,#8a8f7a 100%)',
  },
  {
    id: 'farbe',
    kind: 'raster',
    label: 'Landeskarte',
    url: `${WMTS}/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTR,
    maxNativeZoom: 19,
    swatch: 'linear-gradient(135deg,#e9e4d4 0%,#c9dcb3 45%,#a9cbe6 100%)',
  },
  {
    id: 'winter',
    kind: 'raster',
    label: 'Winter',
    url: `${WMTS}/ch.swisstopo.pixelkarte-farbe-winter/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTR,
    maxNativeZoom: 19,
    swatch: 'linear-gradient(135deg,#ffffff 0%,#e3ecf3 50%,#b9cfe0 100%)',
  },
];

export interface OverlayDef {
  id: OverlayId;
  label: string;
  description: string;
  /** Kachel-Overlay; fehlt bei Vektor-Overlays (Kantone) */
  tiles?: TileDef;
}

export const OVERLAYS: OverlayDef[] = [
  { id: 'cantons', label: 'Kantone', description: 'Grenzen, Namen, Infos per Tippen' },
  {
    id: 'transit',
    label: 'ÖV-Haltestellen',
    description: 'Bahn, Bus, Tram, Schiff, Seilbahn',
    tiles: {
      url: `${WMTS}/ch.bav.haltestellen-oev/default/current/3857/{z}/{x}/{y}.png`,
      attribution: '<a href="https://www.bav.admin.ch/" target="_blank" rel="noopener">© BAV</a>',
      maxNativeZoom: 18,
    },
  },
  {
    id: 'hiking',
    label: 'Wanderwege',
    description: 'Offizielles Wanderwegnetz',
    tiles: {
      url: `${WMTS}/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png`,
      attribution: SWISSTOPO_ATTR,
      maxNativeZoom: 18,
    },
  },
];

/** Ausdehnung der Schweiz (WGS84) */
export const SWISS_BOUNDS: LatLngBoundsExpression = [
  [45.818, 5.956],
  [47.808, 10.492],
];

/**
 * Wie weit man über die Landesgrenze hinaus schieben darf. Grosszügig, damit
 * Orte am Rand (z.B. Chiasso) auch über einem offenen Sheet zentriert werden können.
 */
export const MAX_BOUNDS: LatLngBoundsExpression = [
  [43.6, 3.6],
  [50.0, 12.8],
];

/**
 * Gebiet, für das swisstopo Kacheln liefert (ca. 44.6–49.0° N) – ausserhalb gibt es
 * nur Fehler oder leere Bilder. Leaflet rechnet die Kachelgrenzen bei Zwischen-Zoomstufen
 * leicht falsch, darum liegt die Nordgrenze etwas tiefer.
 */
export const TILE_BOUNDS: LatLngBoundsExpression = [
  [44.6, 4.0],
  [48.9, 12.6],
];

export const SWISS_CENTER: LatLngTuple = [46.8182, 8.2275];
export const MIN_ZOOM = 6.5;
export const MAX_ZOOM = 19;

/** Farbpalette für die Kantonsflächen (Index aus der Vorberechnung) */
export const CANTON_COLORS = ['#f2914f', '#7c74c9', '#f9b07e', '#4b4580', '#e8a07a', '#a59fd9'];
