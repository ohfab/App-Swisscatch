export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Luftlinie in Metern (Haversine) */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(m / 1000)} km`;
}

const swissNumber = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });

export function formatNumber(n: number): string {
  return swissNumber.format(n);
}

/**
 * WGS84 -> Schweizer Landeskoordinaten LV95 (Näherungsformel von swisstopo,
 * Genauigkeit ca. 1 m – reicht für Anzeige und Höhenabfrage).
 */
export function wgs84ToLv95({ lat, lng }: LatLng): { e: number; n: number } {
  const phi = (lat * 3600 - 169028.66) / 10000;
  const lambda = (lng * 3600 - 26782.5) / 10000;
  const e =
    2600072.37 +
    211455.93 * lambda -
    10938.51 * lambda * phi -
    0.36 * lambda * phi * phi -
    44.54 * lambda ** 3;
  const n =
    1200147.07 +
    308807.95 * phi +
    3745.25 * lambda * lambda +
    76.63 * phi * phi -
    194.56 * lambda * lambda * phi +
    119.79 * phi ** 3;
  return { e, n };
}

/** LV95 wie bei swisstopo üblich: 2'600'000, 1'200'000 */
export function formatLv95(p: LatLng): string {
  const { e, n } = wgs84ToLv95(p);
  const fmt = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${fmt(e)}, ${fmt(n)}`;
}

export function formatWgs84({ lat, lng }: LatLng): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

type Ring = number[][];

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punkt-in-Polygon-Test für GeoJSON Polygon/MultiPolygon */
export function pointInGeometry(p: LatLng, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) => {
    const [outer, ...holes] = rings;
    if (!outer || !pointInRing(p.lng, p.lat, outer)) return false;
    return !holes.some((hole) => pointInRing(p.lng, p.lat, hole));
  });
}

/** Text mit HTML-Tags (aus der geo.admin-Suche) in reinen Text umwandeln */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
