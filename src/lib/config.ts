import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';

const WMTS = 'https://wmts.geo.admin.ch/1.0.0';
const SWISSTOPO_ATTR = '<a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">© swisstopo</a>';

export type BasemapId = 'farbe' | 'grau' | 'luftbild' | 'winter';
export type OverlayId = 'cantons' | 'transit' | 'hiking';

export interface TileDef {
  url: string;
  attribution: string;
  maxNativeZoom: number;
}

export interface BasemapDef extends TileDef {
  id: BasemapId;
  label: string;
  /** Farbe der Vorschau-Kachel im Ebenen-Menü */
  swatch: string;
}

export const BASEMAPS: BasemapDef[] = [
  {
    id: 'farbe',
    label: 'Landeskarte',
    url: `${WMTS}/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTR,
    maxNativeZoom: 19,
    swatch: 'linear-gradient(135deg,#e9e4d4 0%,#c9dcb3 45%,#a9cbe6 100%)',
  },
  {
    id: 'grau',
    label: 'Grau',
    url: `${WMTS}/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTR,
    maxNativeZoom: 19,
    swatch: 'linear-gradient(135deg,#f2f2f2 0%,#c4c4c4 60%,#9a9a9a 100%)',
  },
  {
    id: 'luftbild',
    label: 'Luftbild',
    url: `${WMTS}/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg`,
    attribution: SWISSTOPO_ATTR,
    maxNativeZoom: 20,
    swatch: 'linear-gradient(135deg,#5b6b3c 0%,#3f5130 50%,#8a8f7a 100%)',
  },
  {
    id: 'winter',
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
export const CANTON_COLORS = ['#e4572e', '#3f88c5', '#44af69', '#f3a712', '#8e5ea2', '#2bb3a6'];
