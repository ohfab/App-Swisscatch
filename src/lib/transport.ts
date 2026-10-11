import type { LatLng } from './geo';

// Offene Fahrplan-API (https://transport.opendata.ch), Daten der SBB/opentransportdata.swiss
const API = 'https://transport.opendata.ch/v1';

export type StationIcon = 'train' | 'bus' | 'tram' | 'ship' | 'cableway' | 'other';

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance: number | null;
  icon: StationIcon;
}

export interface Departure {
  time: Date;
  delayMin: number;
  line: string;
  category: string;
  to: string;
  platform: string | null;
}

const ICONS: Record<string, StationIcon> = {
  train: 'train',
  bus: 'bus',
  tram: 'tram',
  ship: 'ship',
  cableway: 'cableway',
};

interface RawStation {
  id: string | null;
  name: string | null;
  coordinate: { x: number | null; y: number | null };
  distance: number | null;
  icon: string | null;
}

export async function nearbyStations(p: LatLng, signal?: AbortSignal): Promise<Station[]> {
  const params = new URLSearchParams({ x: String(p.lat), y: String(p.lng), type: 'station' });
  const res = await fetch(`${API}/locations?${params}`, { signal });
  if (!res.ok) throw new Error(`Haltestellen nicht verfügbar (${res.status})`);
  const data = (await res.json()) as { stations?: RawStation[] };
  return (data.stations ?? [])
    .filter((s): s is RawStation & { id: string; name: string } => !!s.id && !!s.name && s.coordinate.x !== null)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.coordinate.x!,
      lng: s.coordinate.y!,
      distance: s.distance,
      icon: ICONS[s.icon ?? ''] ?? 'other',
    }))
    .slice(0, 6);
}

interface RawJourney {
  category: string;
  number: string;
  to: string;
  stop: {
    departureTimestamp: number;
    delay: number | null;
    platform: string | null;
    prognosis?: { platform: string | null } | null;
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  B: 'Bus',
  BN: 'Nachtbus',
  T: 'Tram',
  BAT: 'Schiff',
  FAE: 'Fähre',
  FUN: 'Standseilbahn',
  PB: 'Seilbahn',
  GB: 'Gondelbahn',
  M: 'Metro',
};

/** Liniennamen wie im SBB-Fahrplan: "S3", "IC 8", "Bus 12", "ICE" */
export function lineLabel(category: string, number: string): string {
  // Lange, rein numerische Nummern sind Zugnummern (z.B. "000372") und keine Linien
  if (!number || /^\d{4,}$/.test(number) || /^0\d+$/.test(number)) return CATEGORY_LABEL[category] ?? category;
  if (/^S[NB]?$/.test(category)) return `${category}${number}`;
  return `${CATEGORY_LABEL[category] ?? category} ${number}`;
}

export type LineKind = 'train' | 'sbahn' | 'bus' | 'tram' | 'other';

export function lineKind(category: string): LineKind {
  if (/^S[NB]?$/.test(category)) return 'sbahn';
  if (['B', 'BN', 'EXB', 'NFB', 'KB'].includes(category)) return 'bus';
  if (['T', 'NFT', 'M'].includes(category)) return 'tram';
  if (['BAT', 'FAE', 'FUN', 'PB', 'GB'].includes(category)) return 'other';
  return 'train';
}

export async function stationboard(stationId: string, signal?: AbortSignal): Promise<Departure[]> {
  const params = new URLSearchParams({ id: stationId, limit: '8' });
  const res = await fetch(`${API}/stationboard?${params}`, { signal });
  if (!res.ok) throw new Error(`Abfahrten nicht verfügbar (${res.status})`);
  const data = (await res.json()) as { stationboard?: RawJourney[] };
  return (data.stationboard ?? []).map((j) => ({
    time: new Date(j.stop.departureTimestamp * 1000),
    delayMin: j.stop.delay ?? 0,
    category: j.category,
    line: lineLabel(j.category, j.number),
    to: j.to,
    platform: j.stop.prognosis?.platform ?? j.stop.platform,
  }));
}
