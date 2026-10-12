import { findCanton } from '../lib/cantons';
import { fetchHeight } from '../lib/geoadmin';
import { distanceMeters, wgs84ToLv95, type LatLng } from '../lib/geo';
import { nearbyStations, stationboard } from '../lib/transport';
import { FOUND_RADIUS_M } from './content';
import type { Fix, PowerUpId, PowerUpResult, SpotFacts } from './types';

const timeout = <T>(p: Promise<T>, ms = 9000) =>
  Promise.race([p, new Promise<never>((_, rej) => window.setTimeout(() => rej(new Error('timeout')), ms))]);

async function municipality(p: LatLng): Promise<{ name: string; bfs: number } | null> {
  const params = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${p.lng},${p.lat}`,
    sr: '4326',
    layers: 'all:ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill',
    tolerance: '0',
    returnGeometry: 'false',
    timeInstant: String(new Date().getFullYear()),
    lang: 'de',
  });
  const res = await fetch(`https://api3.geo.admin.ch/rest/services/api/MapServer/identify?${params}`);
  const data = (await res.json()) as { results?: { attributes: { gemname: string; gde_nr: number } }[] };
  const a = data.results?.[0]?.attributes;
  return a ? { name: a.gemname, bfs: a.gde_nr } : null;
}

/** Einwohnerzahl und Amtssprache einer Gemeinde (BFS-Nummer) aus Wikidata */
async function wikidata(bfs: number): Promise<{ population?: number; languages?: string[] }> {
  const query = `SELECT (MAX(?pop) AS ?p) (GROUP_CONCAT(DISTINCT ?ll; separator=",") AS ?langs) WHERE {
    ?item wdt:P771 "${bfs}".
    OPTIONAL { ?item wdt:P1082 ?pop. }
    OPTIONAL { ?item wdt:P37 ?l. ?l rdfs:label ?ll. FILTER(LANG(?ll) = "de") }
  }`;
  const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  const data = (await res.json()) as { results: { bindings: { p?: { value: string }; langs?: { value: string } }[] } };
  const b = data.results.bindings[0];
  const population = b?.p ? Number(b.p.value) : undefined;
  const languages = b?.langs?.value ? b.langs.value.split(',').filter(Boolean) : undefined;
  return { population: Number.isFinite(population) ? population : undefined, languages };
}

/** Objekte einer geo.admin-Ebene in einem Quadrat um den Punkt (Seitenlänge 2 × r Meter) */
async function namesNear(p: LatLng, layer: string, r: number): Promise<string[]> {
  const { e, n } = wgs84ToLv95(p);
  const params = new URLSearchParams({
    geometryType: 'esriGeometryEnvelope',
    geometry: `${e - r},${n - r},${e + r},${n + r}`,
    sr: '2056',
    layers: `all:${layer}`,
    tolerance: '0',
    returnGeometry: 'false',
    lang: 'de',
    limit: '30',
  });
  const res = await fetch(`https://api3.geo.admin.ch/rest/services/api/MapServer/identify?${params}`);
  const data = (await res.json()) as { results?: { attributes: { name?: string | null } }[] };
  return (data.results ?? []).map((x) => (x.attributes.name ?? '').trim()).filter(Boolean);
}

/** Grosse Flüsse; kleine Bäche zählen beim Power-up «See oder Fluss» nicht */
const BIG_RIVERS = new Set([
  'Rhein', 'Hochrhein', 'Alpenrhein', 'Vorderrhein', 'Hinterrhein', 'Aare', 'Rhone', 'Rhône', 'Reuss', 'Limmat', 'Linth', 'Thur', 'Saane', 'Sarine',
  'Ticino', 'Inn', 'En', 'Emme', 'Sihl', 'Töss', 'Glatt', 'Doubs', 'Birs', 'Broye', 'Kander', 'Simme', 'Maggia', 'Moesa', 'Orbe', 'Areuse',
  'Kleine Emme', 'Sitter', 'Lütschine', 'Engelberger Aa', 'Sarner Aa', 'Arve', 'Venoge', 'Visp', 'Landquart', 'Albula', 'Wigger', 'Suhre', 'Wyna', 'Reppisch',
]);

async function waterNear(p: LatLng): Promise<{ lake: string | null; river: string | null }> {
  const [lakes, rivers] = await Promise.all([namesNear(p, 'ch.bafu.vec25-seen', 1000), namesNear(p, 'ch.swisstopo.vec200-hydrography', 1000)]);
  return { lake: lakes[0] ?? null, river: rivers.find((r) => BIG_RIVERS.has(r)) ?? null };
}

/** ÖV-Linien, die an einer Haltestelle abfahren (aus der Abfahrtstafel) */
async function linesAt(stationId: string): Promise<string[]> {
  const deps = await stationboard(stationId, undefined, 40);
  return [...new Set(deps.filter((d) => d.kind !== 'walk' && d.line).map((d) => d.line))].slice(0, 16);
}

/** Fakten zum Versteck ermitteln; was nicht klappt, bleibt einfach leer */
export async function spotFacts(p: LatLng): Promise<SpotFacts> {
  const facts: SpotFacts = {};
  const [canton, muni, height, stations, water] = await Promise.allSettled([
    timeout(findCanton(p)),
    timeout(municipality(p)),
    timeout(fetchHeight(p)),
    timeout(nearbyStations(p)),
    timeout(waterNear(p)),
  ]);
  if (water.status === 'fulfilled') {
    facts.lake = water.value.lake;
    facts.river = water.value.river;
  }
  if (canton.status === 'fulfilled' && canton.value) {
    facts.canton = canton.value.properties.abbr;
    facts.cantonName = canton.value.properties.name;
    facts.languages = canton.value.properties.languages;
  }
  if (height.status === 'fulfilled' && height.value !== null) facts.altitude = Math.round(height.value);
  if (stations.status === 'fulfilled' && stations.value[0]) {
    const s = stations.value[0];
    facts.station = { name: s.name, dist: Math.round(s.distance ?? distanceMeters(p, s)) };
    try {
      facts.lines = await timeout(linesAt(s.id));
    } catch {
      // ohne Abfahrtstafel bleibt das Power-up «Gleiche Linie?» ohne Antwort
    }
  }
  if (muni.status === 'fulfilled' && muni.value) {
    facts.municipality = muni.value.name;
    facts.bfs = muni.value.bfs;
    try {
      const w = await timeout(wikidata(muni.value.bfs));
      if (w.population) facts.population = w.population;
      // Gemeindesprache ist genauer als die Kantonssprachen (z.B. Biel, Freiburg, Wallis)
      if (w.languages?.length) facts.languages = w.languages;
    } catch {
      // ohne Wikidata bleiben die Kantonssprachen
    }
  }
  return facts;
}

const firstLetter = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .charAt(0)
    .toUpperCase();

/** Antwort eines Power-ups aus dem Versteck berechnen (einige brauchen Daten vom Standort der Fänger) */
export async function computePowerUp(type: PowerUpId, spot: { fix: Fix; facts: SpotFacts } | null, me: LatLng | null): Promise<PowerUpResult> {
  if (!spot) return { type: 'unknown' };
  const { fix, facts } = spot;
  switch (type) {
    case 'radar-2':
    case 'radar-10':
    case 'radar-50': {
      if (!me) return { type: 'unknown' };
      const km = Number(type.split('-')[1]);
      return { type: 'radar', km, inside: distanceMeters(me, fix) <= km * 1000, lat: me.lat, lng: me.lng };
    }
    case 'half-ns':
      if (!me) return { type: 'unknown' };
      return { type: 'half', axis: 'ns', side: fix.lat >= me.lat ? 'north' : 'south', lat: me.lat, lng: me.lng };
    case 'half-ew':
      if (!me) return { type: 'unknown' };
      return { type: 'half', axis: 'ew', side: fix.lng >= me.lng ? 'east' : 'west', lat: me.lat, lng: me.lng };
    case 'altitude':
      return facts.altitude !== undefined ? { type: 'altitude', above: facts.altitude >= 800, threshold: 800 } : { type: 'unknown' };
    case 'population':
      return facts.population !== undefined ? { type: 'population', more: facts.population >= 20000, threshold: 20000 } : { type: 'unknown' };
    case 'station':
      return facts.station ? { type: 'station', near: facts.station.dist <= 300, threshold: 300 } : { type: 'unknown' };
    case 'language':
      return facts.languages?.length ? { type: 'language', languages: facts.languages } : { type: 'unknown' };
    case 'canton':
      return facts.canton && facts.cantonName ? { type: 'canton', abbr: facts.canton, name: facts.cantonName } : { type: 'unknown' };
    case 'photo':
      return { type: 'photo' };
    case 'higher': {
      if (!me || facts.altitude === undefined) return { type: 'unknown' };
      const mine = await timeout(fetchHeight(me)).catch(() => null);
      if (mine === null) return { type: 'unknown' };
      return { type: 'higher', higher: facts.altitude > mine, mine: Math.round(mine) };
    }
    case 'water':
      return facts.lake === undefined && facts.river === undefined ? { type: 'unknown' } : { type: 'water', near: !!(facts.lake || facts.river) };
    case 'letter': {
      if (!facts.municipality) return { type: 'unknown' };
      const c = firstLetter(facts.municipality);
      return c >= 'A' && c <= 'Z' ? { type: 'letter', firstHalf: c <= 'M' } : { type: 'unknown' };
    }
    case 'thermo':
      return me ? { type: 'thermo-start', lat: me.lat, lng: me.lng } : { type: 'unknown' };
    case 'line': {
      if (!me || !facts.lines?.length) return { type: 'unknown' };
      try {
        const station = (await timeout(nearbyStations(me)))[0];
        if (!station) return { type: 'unknown' };
        const mine = await timeout(linesAt(station.id));
        const shared = mine.filter((l) => facts.lines!.includes(l));
        return { type: 'line', shared, station: station.name };
      } catch {
        return { type: 'unknown' };
      }
    }
  }
}

export const isAtSpot = (me: LatLng, spot: Fix) => distanceMeters(me, spot) <= FOUND_RADIUS_M;
