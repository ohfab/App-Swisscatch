// Erzeugt public/data/cantons.geojson und public/data/switzerland.geojson
// aus dem npm-Paket "swiss-maps" (Quelle: BFS / swisstopo, BSD-3-Clause).
// Aufruf: npm run geodata
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { feature, merge, neighbors } from 'topojson-client';
import polylabel from 'polylabel';

const require = createRequire(import.meta.url);
const YEAR = '2026';
const topoPath = require.resolve(`swiss-maps/${YEAR}/ch-combined.json`);
const topo = JSON.parse(await readFile(topoPath, 'utf8'));

// BFS-Kantonsnummer -> Stammdaten
const CANTONS = {
  1: { abbr: 'ZH', name: 'Zürich', capital: 'Zürich', languages: ['Deutsch'] },
  2: { abbr: 'BE', name: 'Bern', capital: 'Bern', languages: ['Deutsch', 'Französisch'] },
  3: { abbr: 'LU', name: 'Luzern', capital: 'Luzern', languages: ['Deutsch'] },
  4: { abbr: 'UR', name: 'Uri', capital: 'Altdorf', languages: ['Deutsch'] },
  5: { abbr: 'SZ', name: 'Schwyz', capital: 'Schwyz', languages: ['Deutsch'] },
  6: { abbr: 'OW', name: 'Obwalden', capital: 'Sarnen', languages: ['Deutsch'] },
  7: { abbr: 'NW', name: 'Nidwalden', capital: 'Stans', languages: ['Deutsch'] },
  8: { abbr: 'GL', name: 'Glarus', capital: 'Glarus', languages: ['Deutsch'] },
  9: { abbr: 'ZG', name: 'Zug', capital: 'Zug', languages: ['Deutsch'] },
  10: { abbr: 'FR', name: 'Freiburg', capital: 'Freiburg', languages: ['Französisch', 'Deutsch'] },
  11: { abbr: 'SO', name: 'Solothurn', capital: 'Solothurn', languages: ['Deutsch'] },
  12: { abbr: 'BS', name: 'Basel-Stadt', capital: 'Basel', languages: ['Deutsch'] },
  13: { abbr: 'BL', name: 'Basel-Landschaft', capital: 'Liestal', languages: ['Deutsch'] },
  14: { abbr: 'SH', name: 'Schaffhausen', capital: 'Schaffhausen', languages: ['Deutsch'] },
  15: { abbr: 'AR', name: 'Appenzell Ausserrhoden', capital: 'Herisau', languages: ['Deutsch'] },
  16: { abbr: 'AI', name: 'Appenzell Innerrhoden', capital: 'Appenzell', languages: ['Deutsch'] },
  17: { abbr: 'SG', name: 'St. Gallen', capital: 'St. Gallen', languages: ['Deutsch'] },
  18: { abbr: 'GR', name: 'Graubünden', capital: 'Chur', languages: ['Deutsch', 'Rätoromanisch', 'Italienisch'] },
  19: { abbr: 'AG', name: 'Aargau', capital: 'Aarau', languages: ['Deutsch'] },
  20: { abbr: 'TG', name: 'Thurgau', capital: 'Frauenfeld', languages: ['Deutsch'] },
  21: { abbr: 'TI', name: 'Tessin', capital: 'Bellinzona', languages: ['Italienisch'] },
  22: { abbr: 'VD', name: 'Waadt', capital: 'Lausanne', languages: ['Französisch'] },
  23: { abbr: 'VS', name: 'Wallis', capital: 'Sitten', languages: ['Französisch', 'Deutsch'] },
  24: { abbr: 'NE', name: 'Neuenburg', capital: 'Neuenburg', languages: ['Französisch'] },
  25: { abbr: 'GE', name: 'Genf', capital: 'Genf', languages: ['Französisch'] },
  26: { abbr: 'JU', name: 'Jura', capital: 'Delsberg', languages: ['Französisch'] },
};

const PRECISION = 1e5; // ~1 m
const round = (n) => Math.round(n * PRECISION) / PRECISION;

function roundCoords(coords) {
  if (typeof coords[0] === 'number') return [round(coords[0]), round(coords[1])];
  const out = coords.map(roundCoords);
  // aufeinanderfolgende Duplikate entfernen (nach dem Runden)
  if (typeof out[0][0] === 'number') {
    return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
  }
  return out;
}

// Sphärische Fläche eines Rings in m² (Formel wie in @mapbox/geojson-area)
const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;
function ringArea(ring) {
  let area = 0;
  const n = ring.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    const p3 = ring[(i + 2) % n];
    area += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
  }
  return Math.abs((area * R * R) / 2);
}
function polygonArea(poly) {
  return poly.reduce((sum, ring, i) => sum + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0);
}
const polygonsOf = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates);

// Labelpunkt: "pole of inaccessibility" des grössten Teilpolygons
function labelPoint(geom) {
  const polys = polygonsOf(geom);
  const biggest = polys.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
  const p = polylabel(biggest, 0.0005);
  return [round(p[0]), round(p[1])];
}

// Greedy-Färbung: benachbarte Kantone erhalten unterschiedliche Farben
const cantonGeoms = topo.objects.cantons.geometries;
const adjacency = neighbors(cantonGeoms);
const order = cantonGeoms
  .map((_, i) => i)
  .sort((a, b) => adjacency[b].length - adjacency[a].length);
const colorIndex = new Array(cantonGeoms.length).fill(-1);
for (const i of order) {
  const used = new Set(adjacency[i].map((j) => colorIndex[j]));
  let c = 0;
  while (used.has(c)) c++;
  colorIndex[i] = c;
}

const cantons = feature(topo, topo.objects.cantons);
const abbrOf = (i) => CANTONS[cantonGeoms[i].id].abbr;
cantons.features = cantons.features.map((f, i) => {
  const meta = CANTONS[f.id];
  if (!meta) throw new Error(`Unbekannte Kantonsnummer ${f.id}`);
  const areaKm2 = polygonsOf(f.geometry).reduce((s, p) => s + polygonArea(p), 0) / 1e6;
  return {
    type: 'Feature',
    id: f.id,
    properties: {
      id: f.id,
      ...meta,
      areaKm2: Math.round(areaKm2),
      color: colorIndex[i],
      neighbors: adjacency[i].map(abbrOf).sort(),
      label: labelPoint(f.geometry),
    },
    geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
  };
});
cantons.features.sort((a, b) => a.id - b.id);

const country = merge(topo, topo.objects.country.geometries);
const switzerland = {
  type: 'Feature',
  properties: { name: 'Schweiz' },
  geometry: { type: country.type, coordinates: roundCoords(country.coordinates) },
};

const outDir = new URL('../public/data/', import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL('cantons.geojson', outDir), JSON.stringify(cantons));
await writeFile(new URL('switzerland.geojson', outDir), JSON.stringify(switzerland));

const maxColor = Math.max(...colorIndex);
console.log(`Kantone: ${cantons.features.length}, Farben: ${maxColor + 1}`);
for (const f of cantons.features) {
  const p = f.properties;
  console.log(`${String(p.id).padStart(2)} ${p.abbr} ${p.name.padEnd(24)} ${String(p.areaKm2).padStart(5)} km²  Nachbarn: ${p.neighbors.join(' ')}`);
}
