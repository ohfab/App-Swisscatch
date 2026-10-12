import type { CantonProps } from '../lib/cantons';
import type { PowerUpId, TrapId } from './types';

// ---------- Zufall, der auf allen Handys gleich ist ----------

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministischer Zufallsgenerator (mulberry32) aus einem Text */
export function rng(seed: string) {
  let a = hash32(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)]!;
}

function shuffle<T>(r: () => number, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---------- Power-ups der Fänger ----------

export interface PowerUpDef {
  id: PowerUpId;
  icon: string;
  name: string;
  question: string;
  cost: number;
}

export const POWERUPS: PowerUpDef[] = [
  { id: 'altitude', icon: '⛰️', name: 'Höhenmesser', question: 'Liegt das Versteck über oder unter 800 m ü. M.?', cost: 15 },
  { id: 'higher', icon: '🧗', name: 'Höher oder tiefer?', question: 'Liegt das Versteck höher oder tiefer als du gerade?', cost: 15 },
  { id: 'station', icon: '🚏', name: 'Haltestellen-Check', question: 'Ist die nächste ÖV-Haltestelle näher als 300 m?', cost: 15 },
  { id: 'radar-2', icon: '📡', name: 'Radar 2 km', question: 'Ist das Versteck im Umkreis von 2 km um dich?', cost: 20 },
  { id: 'population', icon: '🏘️', name: 'Einwohner', question: 'Hat die Gemeinde mehr oder weniger als 20 000 Einwohner?', cost: 20 },
  { id: 'water', icon: '🌊', name: 'See oder Fluss', question: 'Gibt es einen See oder grossen Fluss im Umkreis von 1 km ums Versteck?', cost: 20 },
  { id: 'letter', icon: '🔤', name: 'Anfangsbuchstabe', question: 'Beginnt der Name der Gemeinde mit A–M oder mit N–Z?', cost: 25 },
  { id: 'thermo', icon: '🌡️', name: 'Thermometer', question: 'Geh mindestens 1 km weit: Bist du dann näher dran (wärmer) oder weiter weg (kälter)?', cost: 25 },
  { id: 'radar-10', icon: '📡', name: 'Radar 10 km', question: 'Ist das Versteck im Umkreis von 10 km um dich?', cost: 30 },
  { id: 'half-ns', icon: '↕️', name: 'Karte halbieren: Nord/Süd', question: 'Liegt das Versteck nördlich oder südlich von dir?', cost: 30 },
  { id: 'half-ew', icon: '↔️', name: 'Karte halbieren: Ost/West', question: 'Liegt das Versteck östlich oder westlich von dir?', cost: 30 },
  { id: 'language', icon: '🗣️', name: 'Sprachregion', question: 'Welche Sprache spricht man am Versteck?', cost: 35 },
  { id: 'line', icon: '🚆', name: 'Gleiche Linie?', question: 'Hält eine ÖV-Linie deiner nächsten Haltestelle auch beim Versteck?', cost: 35 },
  { id: 'radar-50', icon: '📡', name: 'Radar 50 km', question: 'Ist das Versteck im Umkreis von 50 km um dich?', cost: 40 },
  { id: 'photo', icon: '📸', name: 'Foto anfordern', question: 'Die Verstecker müssen innert 10 Min ein Foto ihrer Umgebung schicken.', cost: 45 },
  { id: 'canton', icon: '🛡️', name: 'Kanton', question: 'In welchem Kanton liegt das Versteck?', cost: 90 },
];

export const powerUp = (id: PowerUpId) => POWERUPS.find((p) => p.id === id)!;

// ---------- Fallen der Verstecker ----------

export interface TrapDef {
  id: TrapId;
  icon: string;
  name: string;
  effect: string;
  cost: number;
  durationMin?: number;
}

export const TRAPS: TrapDef[] = [
  { id: 'inflation', icon: '💸', name: 'Preiserhöhung', effect: 'Power-ups kosten 15 Min lang 50 % mehr.', cost: 25, durationMin: 15 },
  { id: 'fog', icon: '🌫️', name: 'Nebel', effect: 'Die nächste Power-up-Antwort kommt erst nach 10 Min.', cost: 30 },
  { id: 'steal', icon: '🦹', name: 'Punkteklau', effect: 'Die Fänger verlieren sofort 30 Punkte.', cost: 35 },
  { id: 'cloak', icon: '🎩', name: 'Tarnkappe', effect: 'Die nächste Challenge fällt aus – ohne Strafpunkte.', cost: 30 },
  { id: 'jam', icon: '📵', name: 'Funkstille', effect: 'Die Fänger können 10 Min lang keine Power-ups kaufen.', cost: 40, durationMin: 10 },
  { id: 'freeze', icon: '🛑', name: 'Stopp!', effect: 'Die Fänger müssen 10 Min lang stehen bleiben – kein Zug, kein Laufen.', cost: 45, durationMin: 10 },
];

export const trap = (id: TrapId) => TRAPS.find((t) => t.id === id)!;

// ---------- Punkte ----------

export const REWARD = {
  quizCorrect: 15,
  quizWrong: 5,
  clue: 15,
  photo: 25,
  missedChallenge: 15,
  riddle: 10,
  steal: 30,
};

/** Fänger dürfen alle so viele Minuten ein Rätsel lösen */
export const RIDDLE_EVERY_MIN = 15;
/** Ab dieser Distanz zum Versteck gilt «Gefunden!» automatisch */
export const FOUND_RADIUS_M = 200;
/** Ungenaues GPS der Fänger wird beim «Gefunden!» bis zu so vielen Metern berücksichtigt */
export const FOUND_GPS_TOLERANCE_M = 80;

/** Wie weit ein auf der Karte gewähltes Versteck vom GPS-Standort weg sein darf */
export const manualSpotRadius = (accuracy: number) => Math.max(500, Math.round(accuracy * 1.5 + 200));
export const PHOTO_DEADLINE_MIN = 10;
export const FOG_DELAY_MIN = 10;
/** So weit müssen die Fänger beim Thermometer gehen, bevor sie messen dürfen */
export const THERMO_MIN_M = 1000;

// ---------- Spielfeld ----------

/** Grossregionen der Schweiz (BFS) als schnelle Auswahl fürs Spielfeld */
export const REGIONS: { name: string; cantons: string[] }[] = [
  { name: 'Genferseeregion', cantons: ['GE', 'VD', 'VS'] },
  { name: 'Espace Mittelland', cantons: ['BE', 'FR', 'SO', 'NE', 'JU'] },
  { name: 'Nordwestschweiz', cantons: ['BS', 'BL', 'AG'] },
  { name: 'Zürich', cantons: ['ZH'] },
  { name: 'Ostschweiz', cantons: ['GL', 'SH', 'AR', 'AI', 'SG', 'GR', 'TG'] },
  { name: 'Zentralschweiz', cantons: ['LU', 'UR', 'SZ', 'OW', 'NW', 'ZG'] },
  { name: 'Tessin', cantons: ['TI'] },
];

/** Liegt ein Kanton im Spielfeld? Ohne Spielfeld oder ohne bekannten Kanton: ja */
export const inField = (field: string[] | undefined | null, canton: string | undefined) => !field?.length || !canton || field.includes(canton);

// ---------- Challenges der Verstecker ----------

export type ChallengeInput =
  | { kind: 'choice'; options: string[]; correct?: string }
  | { kind: 'text'; placeholder: string; numeric?: boolean }
  | { kind: 'photo' };

export interface ChallengeDef {
  id: string;
  icon: string;
  title: string;
  prompt: string;
  /** Quiz = allgemeines Wissen, verrät nichts. Sonst geht die Antwort an die Fänger. */
  quiz: boolean;
  input: ChallengeInput;
}

const LANG = ['Deutsch', 'Französisch', 'Italienisch', 'Rätoromanisch'];

/** Hinweis-Challenges: die Antwort sehen die Fänger */
const CLUES: (ChallengeDef & { minSeekMin?: number })[] = [
  { id: 'kirchen', icon: '⛪', title: 'Kirchen zählen', prompt: 'Wie viele Kirchen gibt es in eurem Ort?', quiz: false, input: { kind: 'text', placeholder: 'Anzahl', numeric: true } },
  { id: 'sprache', icon: '🗣️', title: 'Sprache', prompt: 'Welche Sprache spricht man dort, wo ihr euch versteckt?', quiz: false, input: { kind: 'choice', options: LANG } },
  { id: 'see', icon: '🌊', title: 'Wasser in Sicht?', prompt: 'Seht ihr von eurem Versteck aus einen See oder Fluss?', quiz: false, input: { kind: 'choice', options: ['Ja', 'Nein'] } },
  { id: 'berge', icon: '🏔️', title: 'Bergblick', prompt: 'Seht ihr Berge mit Schnee?', quiz: false, input: { kind: 'choice', options: ['Ja', 'Nein'] } },
  { id: 'linie', icon: '🚌', title: 'ÖV-Linie', prompt: 'Welche ÖV-Linie hält am nächsten bei euch? (z.B. «Bus 12» oder «S3»)', quiz: false, input: { kind: 'text', placeholder: 'Linie' } },
  { id: 'foto-strasse', icon: '📸', title: 'Foto: Strasse', prompt: 'Schickt ein Foto von der Strasse, an der ihr euch versteckt.', quiz: false, input: { kind: 'photo' } },
  { id: 'foto-himmel', icon: '☁️', title: 'Foto: Himmel', prompt: 'Schickt ein Foto vom Himmel über euch – mit etwas Horizont.', quiz: false, input: { kind: 'photo' } },
  { id: 'foto-gebaeude', icon: '🏛️', title: 'Foto: Gebäude', prompt: 'Schickt ein Foto vom auffälligsten Gebäude in Sichtweite.', quiz: false, input: { kind: 'photo' } },
  { id: 'brunnen', icon: '⛲', title: 'Brunnen', prompt: 'Gibt es in 100 m um euch einen Brunnen?', quiz: false, input: { kind: 'choice', options: ['Ja', 'Nein'] } },
  { id: 'kanton', icon: '🛡️', title: 'Kanton verraten', prompt: 'In welchem Kanton versteckt ihr euch?', quiz: false, input: { kind: 'text', placeholder: 'Kanton' }, minSeekMin: 60 },
];

// ---------- Schweiz-Wissen für Schätz- und Vergleichsfragen ----------

interface FactSet {
  id: string;
  icon: string;
  /** Frage nach dem Wert, z.B. «Wie hoch ist der …?» */
  ask: (name: string) => string;
  /** Vergleichsfrage, z.B. «Welcher Berg ist höher?» */
  compare: string;
  unit: string;
  /** Rundung der falschen Antworten */
  step: number;
  items: [string, number][];
}

const FACTS: FactSet[] = [
  {
    id: 'berg',
    icon: '🏔️',
    ask: (n) => `Wie hoch ist ${n}?`,
    compare: 'Welcher Berg ist höher?',
    unit: 'm ü. M.',
    step: 10,
    items: [
      ['die Dufourspitze', 4634],
      ['das Matterhorn', 4478],
      ['das Weisshorn', 4506],
      ['die Jungfrau', 4158],
      ['der Mönch', 4107],
      ['der Eiger', 3967],
      ['das Finsteraarhorn', 4274],
      ['der Piz Bernina', 4049],
      ['der Titlis', 3238],
      ['der Säntis', 2502],
      ['der Pilatus', 2128],
      ['die Rigi', 1798],
      ['der Niesen', 2362],
      ['der Napf', 1408],
      ['der Chasseral', 1607],
      ['der Uetliberg', 870],
      ['der Monte Generoso', 1701],
      ['der Moléson', 2002],
    ],
  },
  {
    id: 'see',
    icon: '🌊',
    ask: (n) => `Wie gross ist ${n}?`,
    compare: 'Welcher See ist grösser?',
    unit: 'km²',
    step: 1,
    items: [
      ['der Genfersee', 580],
      ['der Bodensee', 536],
      ['der Neuenburgersee', 218],
      ['der Lago Maggiore', 212],
      ['der Vierwaldstättersee', 114],
      ['der Zürichsee', 88],
      ['der Luganersee', 49],
      ['der Thunersee', 48],
      ['der Bielersee', 39],
      ['der Zugersee', 38],
      ['der Brienzersee', 30],
      ['der Walensee', 24],
      ['der Murtensee', 23],
      ['der Sempachersee', 14],
    ],
  },
  {
    id: 'pass',
    icon: '🛣️',
    ask: (n) => `Wie hoch liegt ${n}?`,
    compare: 'Welcher Pass liegt höher?',
    unit: 'm ü. M.',
    step: 10,
    items: [
      ['der Gotthardpass', 2106],
      ['der Furkapass', 2429],
      ['der Grimselpass', 2164],
      ['der Sustenpass', 2224],
      ['der Simplonpass', 2005],
      ['der Grosse St. Bernhard', 2469],
      ['der Julierpass', 2284],
      ['der Berninapass', 2328],
      ['der Klausenpass', 1948],
      ['der Oberalppass', 2044],
      ['der San-Bernardino-Pass', 2065],
      ['der Flüelapass', 2383],
      ['der Albulapass', 2312],
    ],
  },
  {
    id: 'tunnel',
    icon: '🚇',
    ask: (n) => `Wie lang ist ${n}?`,
    compare: 'Welcher Tunnel ist länger?',
    unit: 'km',
    step: 0.1,
    items: [
      ['der Gotthard-Basistunnel', 57.1],
      ['der Lötschberg-Basistunnel', 34.6],
      ['der Ceneri-Basistunnel', 15.4],
      ['der Simplontunnel', 19.8],
      ['der Gotthard-Strassentunnel', 16.9],
      ['der Furka-Basistunnel', 15.4],
      ['der Vereinatunnel', 19.1],
    ],
  },
  {
    id: 'stadt',
    icon: '🏙️',
    ask: (n) => `Wie viele Einwohner hat ${n} ungefähr?`,
    compare: 'Welche Stadt hat mehr Einwohner?',
    unit: 'Einwohner',
    step: 1000,
    items: [
      ['Zürich', 440000],
      ['Genf', 205000],
      ['Basel', 175000],
      ['Lausanne', 140000],
      ['Bern', 135000],
      ['Winterthur', 120000],
      ['Luzern', 83000],
      ['St. Gallen', 77000],
      ['Lugano', 63000],
      ['Biel/Bienne', 56000],
    ],
  },
];

const fmtFact = (v: number, f: FactSet) => `${f.step < 1 ? v.toFixed(1).replace('.', ',') : Math.round(v).toLocaleString('de-CH')} ${f.unit}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Geistis «Fakt des Tages» (jeden Tag ein anderer) */
export function factOfDay(day: string): { icon: string; text: string } {
  const r = rng(`fact:${day}`);
  const f = pick(r, FACTS);
  const [name, value] = pick(r, f.items);
  return { icon: f.icon, text: `${cap(name)}: ${fmtFact(value, f)}` };
}

/** Schätzfrage (4 Antworten) oder Vergleich (2 Antworten) aus dem Schweiz-Wissen */
function factQuestion(r: () => number, compare: boolean): ChallengeDef {
  const f = pick(r, FACTS);
  const [name, value] = pick(r, f.items);
  if (compare) {
    const others = f.items.filter(([n, v]) => n !== name && Math.abs(v - value) / value > 0.03);
    const [other, otherValue] = pick(r, others);
    const correct = value > otherValue ? name : other;
    return {
      id: `quiz-cmp-${f.id}-${name}-${other}`,
      icon: f.icon,
      title: 'Schweiz-Quiz',
      prompt: f.compare,
      quiz: true,
      input: { kind: 'choice', options: shuffle(r, [cap(name), cap(other)]), correct: cap(correct) },
    };
  }
  const correct = fmtFact(value, f);
  const wrong = new Set<string>();
  for (const factor of shuffle(r, [0.62, 0.78, 1.22, 1.38, 1.6])) {
    const v = Math.round((value * factor) / f.step) * f.step;
    const label = fmtFact(v, f);
    if (label !== correct) wrong.add(label);
    if (wrong.size === 3) break;
  }
  return {
    id: `quiz-est-${f.id}-${name}`,
    icon: f.icon,
    title: 'Schätzfrage',
    prompt: f.ask(name),
    quiz: true,
    input: { kind: 'choice', options: shuffle(r, [correct, ...wrong]), correct },
  };
}

/** Allgemeine Quizfragen aus den Kantonsdaten (verraten nichts über das Versteck) */
export function quizQuestion(seed: string, cantons: CantonProps[]): ChallengeDef {
  const r = rng(seed);
  const c = pick(r, cantons);
  const others = shuffle(r, cantons.filter((x) => x.id !== c.id));
  const type = Math.floor(r() * 8);
  if (type === 5 || type === 6) return factQuestion(r, false);
  if (type === 7) return factQuestion(r, true);
  const options = (correct: string, wrong: string[]) => shuffle(r, [correct, ...wrong.slice(0, 3)]);
  switch (type) {
    case 0:
      return {
        id: `quiz-capital-${c.abbr}`,
        icon: '🏛️',
        title: 'Schweiz-Quiz',
        prompt: `Was ist der Hauptort des Kantons ${c.name}?`,
        quiz: true,
        input: { kind: 'choice', options: options(c.capital, [...new Set(others.map((o) => o.capital).filter((x) => x !== c.capital))]), correct: c.capital },
      };
    case 1:
      return {
        id: `quiz-canton-of-${c.abbr}`,
        icon: '🗺️',
        title: 'Schweiz-Quiz',
        prompt: `Zu welchem Kanton gehört der Hauptort ${c.capital}?`,
        quiz: true,
        input: { kind: 'choice', options: options(c.name, others.map((o) => o.name)), correct: c.name },
      };
    case 2: {
      const o = others[0]!;
      const bigger = c.areaKm2 > o.areaKm2 ? c : o;
      return {
        id: `quiz-area-${c.abbr}-${o.abbr}`,
        icon: '📏',
        title: 'Schweiz-Quiz',
        prompt: 'Welcher Kanton ist grösser?',
        quiz: true,
        input: { kind: 'choice', options: shuffle(r, [c.name, o.name]), correct: bigger.name },
      };
    }
    case 3: {
      const n = c.neighbors.length;
      const wrong = shuffle(r, [n - 2, n - 1, n + 1, n + 2].filter((x) => x > 0)).map(String);
      return {
        id: `quiz-neighbors-${c.abbr}`,
        icon: '🧩',
        title: 'Schweiz-Quiz',
        prompt: `Wie viele Nachbarkantone hat ${c.name}?`,
        quiz: true,
        input: { kind: 'choice', options: options(String(n), wrong), correct: String(n) },
      };
    }
    default: {
      const neighbor = c.neighbors.length ? pick(r, c.neighbors) : null;
      const n = cantons.find((x) => x.abbr === neighbor);
      const notNeighbors = others.filter((o) => !c.neighbors.includes(o.abbr));
      if (!n || notNeighbors.length < 3) return quizQuestion(`${seed}x`, cantons);
      return {
        id: `quiz-borders-${c.abbr}-${n.abbr}`,
        icon: '🤝',
        title: 'Schweiz-Quiz',
        prompt: `Welcher dieser Kantone grenzt an ${c.name}?`,
        quiz: true,
        input: { kind: 'choice', options: options(n.name, notNeighbors.map((o) => o.name)), correct: n.name },
      };
    }
  }
}

/** Challenge Nr. n: Quiz während der Versteckzeit, danach Hinweise über das Versteck */
export function challengeFor(seed: string, n: number, inHiding: boolean, seekMin: number, cantons: CantonProps[]): ChallengeDef {
  if (inHiding) return quizQuestion(`${seed}:challenge:${n}`, cantons);
  const r = rng(`${seed}:clue:${n}`);
  const pool = CLUES.filter((c) => (c.minSeekMin ?? 0) <= seekMin);
  // Jede dritte Hinweis-Challenge ist ein Foto
  const photos = pool.filter((c) => c.input.kind === 'photo');
  const others = pool.filter((c) => c.input.kind !== 'photo');
  return n % 3 === 0 && photos.length ? pick(r, photos) : pick(r, others);
}

export function riddleFor(seed: string, n: number, cantons: CantonProps[]): ChallengeDef {
  return { ...quizQuestion(`${seed}:riddle:${n}`, cantons), title: 'Rätsel' };
}
