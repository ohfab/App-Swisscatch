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
  { id: 'station', icon: '🚏', name: 'Haltestellen-Check', question: 'Ist die nächste ÖV-Haltestelle näher als 300 m?', cost: 15 },
  { id: 'radar-2', icon: '📡', name: 'Radar 2 km', question: 'Ist das Versteck im Umkreis von 2 km um dich?', cost: 20 },
  { id: 'population', icon: '🏘️', name: 'Einwohner', question: 'Hat die Gemeinde mehr oder weniger als 20 000 Einwohner?', cost: 20 },
  { id: 'radar-10', icon: '📡', name: 'Radar 10 km', question: 'Ist das Versteck im Umkreis von 10 km um dich?', cost: 30 },
  { id: 'half-ns', icon: '↕️', name: 'Karte halbieren: Nord/Süd', question: 'Liegt das Versteck nördlich oder südlich von dir?', cost: 30 },
  { id: 'half-ew', icon: '↔️', name: 'Karte halbieren: Ost/West', question: 'Liegt das Versteck östlich oder westlich von dir?', cost: 30 },
  { id: 'language', icon: '🗣️', name: 'Sprachregion', question: 'Welche Sprache spricht man am Versteck?', cost: 35 },
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
  { id: 'jam', icon: '📵', name: 'Funkstille', effect: 'Die Fänger können 10 Min lang keine Power-ups kaufen.', cost: 40, durationMin: 10 },
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

/** Allgemeine Quizfragen aus den Kantonsdaten (verraten nichts über das Versteck) */
export function quizQuestion(seed: string, cantons: CantonProps[]): ChallengeDef {
  const r = rng(seed);
  const c = pick(r, cantons);
  const others = shuffle(r, cantons.filter((x) => x.id !== c.id));
  const type = Math.floor(r() * 5);
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
