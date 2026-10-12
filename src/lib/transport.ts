import type { LatLng } from './geo';

// Fahrplandaten von search.ch (https://search.ch/timetable/api/help).
// Gratis mit Limit pro Tag; die Anfragen kommen direkt vom Handy jedes Spielers.
const API = 'https://search.ch/timetable/api';
export const TIMETABLE_CREDIT = 'Fahrplan: search.ch';
export const TIMETABLE_URL = 'https://search.ch/timetable/';

export type StationIcon = 'train' | 'bus' | 'tram' | 'ship' | 'cableway' | 'other';
export type LineKind = 'train' | 'sbahn' | 'bus' | 'tram' | 'ship' | 'cableway' | 'walk' | 'other';

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance: number | null;
  icon: StationIcon;
}

export interface LineColor {
  bg: string;
  fg: string;
}

export interface Departure {
  /** "HH:MM" in Schweizer Zeit */
  time: string;
  delayMin: number | null;
  cancelled: boolean;
  line: string;
  kind: LineKind;
  color: LineColor | null;
  to: string;
  platform: string | null;
}

/** Ein Ort, den die Verbindungssuche versteht: Haltestelle, Adresse oder Koordinate */
export interface Endpoint {
  kind: 'me' | 'station' | 'address' | 'point';
  label: string;
  /** Was an search.ch geht: Haltestellen-ID, Name/Adresse oder "lat,lon" */
  query?: string;
  lat?: number;
  lng?: number;
}

export interface StopPoint {
  name: string;
  time: string | null;
  platform: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Leg {
  kind: LineKind;
  line: string | null;
  color: LineColor | null;
  /** Endstation der Linie ("Richtung") */
  direction: string | null;
  from: StopPoint;
  to: StopPoint;
  stops: StopPoint[];
  durationMin: number;
  delayMin: number | null;
}

export interface Connection {
  id: string;
  departure: string;
  arrival: string;
  /** Rohwert "YYYY-MM-DD HH:MM:SS" für Folgesuchen */
  departureRaw: string;
  durationMin: number;
  transfers: number;
  legs: Leg[];
}

export interface RouteResult {
  from: string;
  to: string;
  connections: Connection[];
}

// ---------- Hilfsfunktionen ----------

const hhmm = (raw: string | null | undefined) => (raw && raw.length >= 16 ? raw.slice(11, 16) : null);

function parseDelay(raw: unknown): { delay: number | null; cancelled: boolean } {
  if (typeof raw !== 'string' || raw === '') return { delay: null, cancelled: false };
  if (raw.toUpperCase() === 'X') return { delay: null, cancelled: true };
  const n = parseInt(raw, 10);
  return { delay: Number.isFinite(n) ? n : null, cancelled: false };
}

function hex(c: string | null | undefined): string | null {
  if (!c || !/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) return null;
  return `#${c}`;
}

function colorOf(bg?: string | null, fg?: string | null): LineColor | null {
  const b = hex(bg);
  return b ? { bg: b, fg: hex(fg) ?? '#ffffff' } : null;
}

export function kindOf(type: string | null | undefined): LineKind {
  switch (type) {
    case 'express_train':
    case 'train':
      return 'train';
    case 'strain':
      return 'sbahn';
    case 'tram':
      return 'tram';
    case 'bus':
    case 'post':
    case 'night_bus':
      return 'bus';
    case 'ship':
    case 'boat':
      return 'ship';
    case 'cablecar':
    case 'gondola':
    case 'chairlift':
    case 'funicular':
    case 'rack_railroad':
      return 'cableway';
    case 'walk':
      return 'walk';
    default:
      return 'other';
  }
}

const KIND_PREFIX: Partial<Record<LineKind, string>> = { bus: 'Bus', tram: 'Tram', ship: 'Schiff' };

/** Liniennamen wie im SBB-Fahrplan: "IC 8", "S3", "Bus 12", "Tram 9" */
export function lineLabel(line: string | null | undefined, kind: LineKind, group?: string, number?: string): string {
  let l = (line ?? '').trim();
  if (l && group && number && l === group) l = `${group} ${number}`;
  if (!l) return KIND_PREFIX[kind] ?? (kind === 'cableway' ? 'Bahn' : 'Zug');
  const prefix = KIND_PREFIX[kind];
  return prefix && /^\d/.test(l) ? `${prefix} ${l}` : l;
}

/** Standardfarben, falls search.ch keine Linienfarbe liefert */
export const KIND_COLOR: Record<LineKind, LineColor> = {
  train: { bg: '#eb0000', fg: '#ffffff' },
  sbahn: { bg: '#2d327d', fg: '#ffffff' },
  bus: { bg: '#0f766e', fg: '#ffffff' },
  tram: { bg: '#7c3aed', fg: '#ffffff' },
  ship: { bg: '#0369a1', fg: '#ffffff' },
  cableway: { bg: '#b45309', fg: '#ffffff' },
  walk: { bg: '#6b7280', fg: '#ffffff' },
  other: { bg: '#6b7280', fg: '#ffffff' },
};

function iconOf(iconclass: string | undefined): StationIcon | null {
  const t = iconclass?.replace('sl-icon-type-', '') ?? '';
  if (t === 'adr' || !iconclass?.startsWith('sl-icon-type-')) return null;
  if (t.includes('strain') || t.includes('train')) return 'train';
  if (t.includes('tram')) return 'tram';
  if (t.includes('bus') || t.includes('post')) return 'bus';
  if (t.includes('ship') || t.includes('boat')) return 'ship';
  if (t.includes('gondola') || t.includes('cable') || t.includes('funicular') || t.includes('chair')) return 'cableway';
  return 'other';
}

async function getJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, { signal });
  if (!res.ok) throw new Error(`Fahrplan nicht erreichbar (${res.status})`);
  const data = (await res.json()) as T & { messages?: string[] };
  if (data && typeof data === 'object' && 'messages' in data && Array.isArray(data.messages) && data.messages.length) {
    throw new Error(data.messages.join(' '));
  }
  return data;
}

// ---------- Haltestellen & Abfahrten ----------

interface RawCompletion {
  label: string;
  id?: string;
  lat?: number;
  lon?: number;
  dist?: number;
  iconclass?: string;
}

export async function nearbyStations(p: LatLng, signal?: AbortSignal): Promise<Station[]> {
  const list = await getJson<RawCompletion[]>(
    'completion.json',
    { latlon: `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`, accuracy: '20', show_ids: '1', show_coordinates: '1' },
    signal,
  );
  return list
    .filter((s) => s.id && typeof s.lat === 'number' && typeof s.lon === 'number')
    .map((s) => ({
      id: s.id!,
      name: s.label.trim(),
      lat: s.lat!,
      lng: s.lon!,
      distance: typeof s.dist === 'number' ? Math.round(s.dist) : null,
      icon: iconOf(s.iconclass) ?? 'other',
    }))
    .slice(0, 6);
}

interface RawBoardEntry {
  time: string;
  type: string;
  line: string;
  color?: string;
  terminal?: { name: string };
  track?: string | null;
  dep_delay?: string | null;
  '*G'?: string;
  '*L'?: string;
}

export async function stationboard(stationId: string, signal?: AbortSignal, limit = 10): Promise<Departure[]> {
  const data = await getJson<{ connections?: RawBoardEntry[] }>(
    'stationboard.json',
    { stop: stationId, limit: String(limit), show_delays: '1', show_tracks: '1', mode: 'depart' },
    signal,
  );
  return (data.connections ?? []).map((c) => {
    const kind = kindOf(c.type);
    const [bg, fg] = (c.color ?? '').split('~');
    const { delay, cancelled } = parseDelay(c.dep_delay);
    return {
      time: hhmm(c.time) ?? '',
      delayMin: delay,
      cancelled,
      kind,
      line: lineLabel(c.line, kind, c['*G'], c['*L']),
      color: colorOf(bg, fg),
      to: c.terminal?.name ?? '',
      platform: c.track ?? null,
    };
  });
}

// ---------- Ortssuche für die Verbindungssuche ----------

export interface Suggestion {
  label: string;
  endpoint: Endpoint;
  icon: StationIcon | 'address';
}

export async function suggestPlaces(term: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const list = await getJson<RawCompletion[]>(
    'completion.json',
    { term, show_ids: '1', show_coordinates: '1' },
    signal,
  );
  return list
    .filter((s) => s.iconclass?.startsWith('sl-icon-type-'))
    .slice(0, 8)
    .map((s) => {
      const label = s.label.trim();
      const icon = iconOf(s.iconclass);
      const hasCoords = typeof s.lat === 'number' && typeof s.lon === 'number';
      return {
        label,
        icon: icon ?? 'address',
        endpoint: {
          kind: icon ? 'station' : 'address',
          label,
          query: s.id ?? label,
          ...(hasCoords ? { lat: s.lat, lng: s.lon } : {}),
        },
      };
    });
}

// ---------- Verbindungen ----------

interface RawStop {
  name: string;
  arrival?: string | null;
  departure?: string | null;
  lat?: number;
  lon?: number;
  track?: string | null;
}

interface RawLeg extends RawStop {
  type?: string | null;
  line?: string | null;
  terminal?: string | null;
  fgcolor?: string | null;
  bgcolor?: string | null;
  '*G'?: string;
  '*L'?: string;
  runningtime?: number | null;
  stops?: RawStop[] | null;
  exit?: (RawStop & { arr_delay?: string }) | null;
  dep_delay?: string | null;
}

interface RawConnection {
  duration: number;
  departure: string;
  arrival: string;
  legs: RawLeg[];
}

interface RawRoute {
  connections?: RawConnection[];
  points?: { text: string; lat: number; lon: number }[];
}

const point = (s: RawStop | null | undefined, time: string | null | undefined, fallback?: { lat: number; lon: number }): StopPoint => ({
  name: (s?.name ?? '').replace(/\s*@\d+,\d+$/, ''),
  time: hhmm(time),
  platform: s?.track ?? null,
  lat: typeof s?.lat === 'number' ? s.lat : (fallback?.lat ?? null),
  lng: typeof s?.lon === 'number' ? s.lon : (fallback?.lon ?? null),
});

function parseConnection(c: RawConnection, points: RawRoute['points']): Connection {
  const start = points?.[0];
  const end = points?.[points.length - 1];
  const raw = c.legs.filter((l) => l.exit);
  const legs: Leg[] = raw.map((l, i) => {
    const kind = kindOf(l.type);
    const isFirst = i === 0;
    const isLast = i === raw.length - 1;
    return {
      kind,
      line: kind === 'walk' ? null : lineLabel(l.line, kind, l['*G'], l['*L']),
      color: kind === 'walk' ? null : colorOf(l.bgcolor, l.fgcolor),
      direction: kind === 'walk' ? null : (l.terminal ?? null),
      from: point(l, l.departure, isFirst ? start : undefined),
      to: point(l.exit, l.exit?.arrival, isLast ? end : undefined),
      stops: (l.stops ?? []).map((s) => point(s, s.departure ?? s.arrival)),
      durationMin: Math.max(1, Math.round((l.runningtime ?? 0) / 60)),
      delayMin: parseDelay(l.dep_delay).delay,
    };
  });
  // Fusswege ohne eigene Koordinaten übernehmen die des Nachbarabschnitts
  legs.forEach((leg, i) => {
    if (leg.to.lat === null && legs[i + 1]) Object.assign(leg.to, { lat: legs[i + 1]!.from.lat, lng: legs[i + 1]!.from.lng });
    if (leg.from.lat === null && legs[i - 1]) Object.assign(leg.from, { lat: legs[i - 1]!.to.lat, lng: legs[i - 1]!.to.lng });
  });
  const rides = legs.filter((l) => l.kind !== 'walk').length;
  return {
    id: `${c.departure}_${c.arrival}_${legs.map((l) => l.line ?? 'walk').join('-')}`,
    departure: hhmm(c.departure) ?? '',
    arrival: hhmm(c.arrival) ?? '',
    departureRaw: c.departure,
    durationMin: Math.round(c.duration / 60),
    transfers: Math.max(0, rides - 1),
    legs,
  };
}

export interface RouteOptions {
  /** "YYYY-MM-DDTHH:MM" (wie aus <input type="datetime-local">) */
  at?: string;
  arrival?: boolean;
}

export async function findConnections(
  from: string,
  to: string,
  opts: RouteOptions = {},
  signal?: AbortSignal,
): Promise<RouteResult> {
  const params: Record<string, string> = { from, to, num: '5', show_delays: '1' };
  if (opts.at) {
    const [date, time] = opts.at.split('T') as [string, string];
    const [y, m, d] = date.split('-');
    params.date = `${d}.${m}.${y}`;
    params.time = time.slice(0, 5);
    params.time_type = opts.arrival ? 'arrival' : 'depart';
  }
  const data = await getJson<RawRoute>('route.json', params, signal);
  const points = data.points;
  return {
    from: points?.[0]?.text.replace(/\s*@\d+,\d+$/, '') ?? from,
    to: points?.[points.length - 1]?.text.replace(/\s*@\d+,\d+$/, '') ?? to,
    connections: (data.connections ?? []).map((c) => parseConnection(c, points)),
  };
}

/** Nächste Suche ab einer Minute nach der letzten gefundenen Abfahrt (auch über Mitternacht) */
export function laterThan(departureRaw: string): string {
  const [date, time] = departureRaw.split(' ') as [string, string];
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, min] = time.split(':').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1, d, h, min + 1));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export const endpointQuery = (e: Endpoint): string | null =>
  e.query ?? (typeof e.lat === 'number' && typeof e.lng === 'number' ? `${e.lat.toFixed(6)},${e.lng.toFixed(6)}` : null);
