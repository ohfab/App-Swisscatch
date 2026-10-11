import { stripHtml, wgs84ToLv95, type LatLng } from './geo';

const API = 'https://api3.geo.admin.ch/rest/services';

export type SearchKind = 'gemeinde' | 'plz' | 'adresse' | 'ort' | 'kanton' | 'bezirk' | 'andere';

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  kind: SearchKind;
  lat: number;
  lng: number;
  /** [[südwest], [nordost]] falls die Fundstelle eine Fläche ist */
  bounds?: [[number, number], [number, number]];
}

interface RawResult {
  id: number | string;
  attrs: {
    label: string;
    origin: string;
    lat: number;
    lon: number;
    detail?: string;
    objectclass?: string;
    geom_st_box2d?: string;
  };
}

const KIND_BY_ORIGIN: Record<string, SearchKind> = {
  gg25: 'gemeinde',
  zipcode: 'plz',
  address: 'adresse',
  gazetteer: 'ort',
  kantone: 'kanton',
  district: 'bezirk',
};

export const KIND_LABEL: Record<SearchKind, string> = {
  gemeinde: 'Gemeinde',
  plz: 'PLZ',
  adresse: 'Adresse',
  ort: 'Ort',
  kanton: 'Kanton',
  bezirk: 'Bezirk',
  andere: 'Treffer',
};

function parseBox(box?: string): SearchResult['bounds'] {
  const m = box?.match(/BOX\(([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+)\)/);
  if (!m) return undefined;
  const [minX, minY, maxX, maxY] = m.slice(1).map(Number) as [number, number, number, number];
  if (maxX - minX < 1e-4 && maxY - minY < 1e-4) return undefined;
  return [
    [minY, minX],
    [maxY, maxX],
  ];
}

interface Parsed extends SearchResult {
  settlement: boolean;
  /** Kleinere Zahl = weiter oben in der Trefferliste */
  priority: number;
}

/** Gemeinden zuerst, dann bekannte Landmarken (Gipfel, Seen, Pässe), dann Siedlungen, Rest */
function priorityOf(kind: SearchKind, objectType: string | null, settlement: boolean): number {
  if (kind === 'gemeinde' || kind === 'kanton' || kind === 'bezirk' || kind === 'plz') return 0;
  if (objectType && /gipfel|^see$|pass$|gletscher/i.test(objectType)) return 1;
  if (settlement) return 2;
  if (kind === 'adresse') return 4;
  return 3;
}

function parseResult(r: RawResult): Parsed {
  const label = r.attrs.label.replace(/\s+/g, ' ');
  // Gazetteer-Einträge beginnen mit dem Objekttyp in <i>…</i>, z.B. "<i>Alpiner Gipfel</i> <b>Matterhorn</b>"
  const typeMatch = label.match(/^<i>([\s\S]*?)<\/i>/);
  const boldMatch = label.match(/<b>([\s\S]*?)<\/b>/);
  let title = stripHtml(boldMatch?.[1] ?? label).split('|')[0]!.trim();
  let rest = stripHtml(label.replace(/^<i>[\s\S]*?<\/i>/, '').replace(/<b>[\s\S]*?<\/b>/, ''))
    .replace(/\(\)\s*-?\s*/, '')
    .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
    .trim();
  // "(VS) - Zermatt" -> "Zermatt (VS)", lange Gemeindelisten kürzen
  const muni = rest.match(/^\(([A-Z]{2}(?:,[A-Z]{2})*)\)\s*-\s*(.+)$/);
  if (muni) {
    const cantons = muni[1]!.split(',').join(', ');
    const names = muni[2]!.split(',').map((n) => n.trim());
    const shown = names.includes(title) ? [title] : names.length > 2 ? [...names.slice(0, 2), '…'] : names;
    const joined = shown.join(', ');
    rest = joined.includes(`(${cantons})`) ? joined : `${joined} (${cantons})`;
  }
  const kind = KIND_BY_ORIGIN[r.attrs.origin] ?? 'andere';
  if (kind === 'adresse') {
    // Label "Bahnhofstrasse 1 <b>8001 Zürich</b>": Strasse als Titel, Ort als Zusatz
    [title, rest] = [rest || title, title];
  }
  const objectType = typeMatch ? stripHtml(typeMatch[1]!) : null;
  const subtitle = [objectType ?? KIND_LABEL[kind], rest].filter(Boolean).join(' · ');
  const settlement = r.attrs.objectclass === 'TLM_SIEDLUNGSNAME';
  return {
    id: `${r.attrs.origin}-${r.id}`,
    title,
    subtitle,
    kind,
    lat: r.attrs.lat,
    lng: r.attrs.lon,
    bounds: parseBox(r.attrs.geom_st_box2d),
    settlement,
    priority: priorityOf(kind, objectType, settlement),
  };
}

/** Ortssuche über den offiziellen SearchServer von geo.admin.ch */
export async function searchLocations(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    searchText: query,
    type: 'locations',
    sr: '4326',
    limit: '15',
    lang: 'de',
  });
  const res = await fetch(`${API}/api/SearchServer?${params}`, { signal });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as { results?: RawResult[] };
  // Grundstücke (Parzellen) sind für die Karte nicht hilfreich
  const parsed = (data.results ?? []).filter((r) => r.attrs.origin !== 'parcel').map(parseResult);

  // Gemeinden liefern ihren Flächenmittelpunkt (in Zermatt z.B. auf 2469 m).
  // Gibt es eine gleichnamige Siedlung, nehmen wir deren Ortszentrum.
  const used = new Set<string>();
  for (const g of parsed) {
    if (g.kind !== 'gemeinde') continue;
    const name = g.title.replace(/\s*\([A-Z]{2}\)$/, '');
    const towns = parsed.filter((s) => s.settlement && s.title === name);
    if (towns[0]) {
      g.lat = towns[0].lat;
      g.lng = towns[0].lng;
      towns.forEach((t) => used.add(t.id));
    }
  }

  const seen = new Set<string>();
  return parsed
    .filter((r) => !used.has(r.id))
    .sort((a, b) => a.priority - b.priority)
    .filter((r) => {
      const key = `${r.title}|${r.lat.toFixed(3)}|${r.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map(({ settlement: _s, priority: _p, ...r }) => r);
}

/** Höhe über Meer (swissALTI3D) für einen Punkt in der Schweiz */
export async function fetchHeight(p: LatLng, signal?: AbortSignal): Promise<number | null> {
  const { e, n } = wgs84ToLv95(p);
  const params = new URLSearchParams({ easting: e.toFixed(1), northing: n.toFixed(1), sr: '2056' });
  const res = await fetch(`${API}/height?${params}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { height?: string };
  const h = Number(data.height);
  return Number.isFinite(h) ? h : null;
}
