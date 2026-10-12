import { useSyncExternalStore } from 'react';
import { load, save } from './storage';

/*
 * Eigener Fortschritt (nur auf diesem Gerät): Runden, Siege, Power-ups,
 * besuchte Kantone, Abzeichen, Level. Geisti feiert neue Abzeichen.
 */

export interface Stats {
  rounds: number;
  wins: number;
  winsSeeker: number;
  winsHider: number;
  powerups: number;
  traps: number;
  challenges: number;
  finds: number;
  chats: number;
  routes: number;
  pokes: number;
  pins: number;
  nightRounds: number;
  cantons: string[];
  /** Schon gezählte Runden («Code:Runde»), damit nichts doppelt zählt */
  recorded: string[];
  /** Abzeichen → Zeitpunkt der Freischaltung */
  badges: Record<string, number>;
  tour: boolean;
  /** Tagesquiz: Tag («JJJJ-MM-TT») → richtige Antworten von 5 */
  quiz: Record<string, number>;
  /** Letzte Runden fürs Profil */
  history: RoundLog[];
}

export interface RoundLog {
  at: number;
  name: string;
  team: 'seeker' | 'hider';
  won: boolean;
}

export const QUIZ_LEN = 5;

const EMPTY: Stats = {
  rounds: 0,
  wins: 0,
  winsSeeker: 0,
  winsHider: 0,
  powerups: 0,
  traps: 0,
  challenges: 0,
  finds: 0,
  chats: 0,
  routes: 0,
  pokes: 0,
  pins: 0,
  nightRounds: 0,
  cantons: [],
  recorded: [],
  badges: {},
  tour: false,
  quiz: {},
  history: [],
};

export interface Badge {
  id: string;
  icon: string;
  name: string;
  text: string;
  /** Fortschritt [jetzt, Ziel] */
  progress: (s: Stats) => [number, number];
}

const count = (key: keyof Stats, goal: number) => (s: Stats): [number, number] => [Math.min(goal, s[key] as number), goal];

export const BADGES: Badge[] = [
  { id: 'first-round', icon: '🎬', name: 'Erste Runde', text: 'Spiel deine erste Runde fertig.', progress: count('rounds', 1) },
  { id: 'first-win', icon: '🏆', name: 'Gewonnen!', text: 'Gewinne eine Runde.', progress: count('wins', 1) },
  { id: 'hunter', icon: '🔍', name: 'Spürnase', text: 'Gewinne als Fänger.', progress: count('winsSeeker', 1) },
  { id: 'phantom', icon: '🫥', name: 'Phantom', text: 'Gewinne als Verstecker.', progress: count('winsHider', 1) },
  { id: 'finder', icon: '🎯', name: 'Erwischt!', text: 'Finde das Versteck selbst.', progress: count('finds', 1) },
  { id: 'veteran', icon: '👴', name: 'Alter Geist', text: 'Spiel 10 Runden.', progress: count('rounds', 10) },
  { id: 'shopper', icon: '🛍️', name: 'Shopping-Geist', text: 'Kauf 10 Power-ups.', progress: count('powerups', 10) },
  { id: 'trapper', icon: '🪤', name: 'Fallensteller', text: 'Stell 5 Fallen.', progress: count('traps', 5) },
  { id: 'challenger', icon: '💪', name: 'Challenge-Champion', text: 'Lös 10 Challenges.', progress: count('challenges', 10) },
  { id: 'chatter', icon: '💬', name: 'Plaudertasche', text: 'Schreib 25 Nachrichten im Chat.', progress: count('chats', 25) },
  { id: 'night', icon: '🌙', name: 'Nachtgespenst', text: 'Spiel eine Runde nach 22 Uhr fertig.', progress: count('nightRounds', 1) },
  { id: 'cantons5', icon: '🧀', name: 'Kantönligeist', text: 'Sei in 5 Kantonen unterwegs.', progress: (s) => [Math.min(5, s.cantons.length), 5] },
  { id: 'cantons13', icon: '🏔️', name: 'Halbe Schweiz', text: 'Sei in 13 Kantonen unterwegs.', progress: (s) => [Math.min(13, s.cantons.length), 13] },
  { id: 'cantons26', icon: '🇨🇭', name: 'Ganze Schweiz', text: 'Sei in allen 26 Kantonen unterwegs.', progress: (s) => [Math.min(26, s.cantons.length), 26] },
  { id: 'commuter', icon: '🚆', name: 'Pendler', text: 'Such 10 Verbindungen im Fahrplan.', progress: count('routes', 10) },
  { id: 'collector', icon: '📍', name: 'Sammler', text: 'Speichere 5 Orte.', progress: count('pins', 5) },
  { id: 'curious', icon: '👀', name: 'Neugierig', text: 'Mach die Tour mit Geisti.', progress: (s) => [s.tour ? 1 : 0, 1] },
  { id: 'tickle', icon: '🪶', name: 'Kitzelig', text: 'Tipp Geisti 10-mal an.', progress: count('pokes', 10) },
  { id: 'quiz1', icon: '🧠', name: 'Streber', text: 'Mach Geistis Tagesquiz.', progress: (s) => [Math.min(1, Object.keys(s.quiz).length), 1] },
  { id: 'perfect', icon: '💯', name: 'Besserwisser', text: 'Alle 5 Fragen im Tagesquiz richtig.', progress: (s) => [Object.values(s.quiz).some((v) => v >= QUIZ_LEN) ? 1 : 0, 1] },
  { id: 'streak3', icon: '🔥', name: 'Dranbleiber', text: '3 Tage in Folge das Tagesquiz.', progress: (s) => [Math.min(3, bestStreak(s)), 3] },
  { id: 'streak7', icon: '🗓️', name: 'Wochengeist', text: '7 Tage in Folge das Tagesquiz.', progress: (s) => [Math.min(7, bestStreak(s)), 7] },
];

/** Level mit Namen – vom Nebelhauch bis zum Zeitgeist */
export const LEVELS = [
  { xp: 0, name: 'Nebelhauch' },
  { xp: 100, name: 'Schattenwesen' },
  { xp: 250, name: 'Poltergeist' },
  { xp: 450, name: 'Spukprofi' },
  { xp: 700, name: 'Zeitreisender' },
  { xp: 1000, name: 'Zeitgeist' },
];

export function xpOf(s: Stats): number {
  return (
    s.rounds * 50 +
    s.wins * 100 +
    s.powerups * 5 +
    s.traps * 10 +
    s.challenges * 10 +
    s.finds * 30 +
    s.cantons.length * 20 +
    Object.values(s.quiz).reduce((sum, v) => sum + v * 10 + (v >= QUIZ_LEN ? 20 : 0), 0) +
    Object.keys(s.badges).length * 25
  );
}

export function levelOf(xp: number) {
  // Nach dem letzten Namen geht es alle 400 XP ein Level weiter
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1]!.xp) i++;
  let base = LEVELS[i]!.xp;
  let next = LEVELS[i + 1]?.xp ?? base + 400;
  let n = i + 1;
  while (i === LEVELS.length - 1 && xp >= next) {
    n += 1;
    base = next;
    next += 400;
  }
  return { n, name: LEVELS[Math.min(i, LEVELS.length - 1)]!.name, base, next, progress: (xp - base) / (next - base) };
}

// ---------- Tagesquiz und Serie ----------

/** Heutiger Tag in der Schweiz als «JJJJ-MM-TT» */
export function today(at = Date.now()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Tage in Folge mit Tagesquiz (zählt auch, wenn heute noch offen ist) */
export function streakOf(s: Stats, now = Date.now()): number {
  let day = today(now);
  if (s.quiz[day] === undefined) day = dayBefore(day);
  let n = 0;
  while (s.quiz[day] !== undefined) {
    n++;
    day = dayBefore(day);
  }
  return n;
}

function bestStreak(s: Stats): number {
  const days = Object.keys(s.quiz).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && dayBefore(d) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// ---------- Speicher ----------

let stats: Stats = { ...EMPTY, ...load<Partial<Stats>>('stats.v1', {}) };
const listeners = new Set<() => void>();
const badgeListeners = new Set<(b: Badge) => void>();

function commit(next: Stats) {
  const unlocked: Badge[] = [];
  const badges = { ...next.badges };
  for (const b of BADGES) {
    if (badges[b.id]) continue;
    const [cur, goal] = b.progress(next);
    if (cur >= goal) {
      badges[b.id] = Date.now();
      unlocked.push(b);
    }
  }
  stats = { ...next, badges };
  save('stats.v1', stats);
  listeners.forEach((l) => l());
  unlocked.forEach((b) => badgeListeners.forEach((l) => l(b)));
}

export function getStats() {
  return stats;
}

export function useStats(): Stats {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => stats,
  );
}

/** Geisti meldet sich, wenn ein Abzeichen dazukommt */
export function onBadge(l: (b: Badge) => void) {
  badgeListeners.add(l);
  return () => {
    badgeListeners.delete(l);
  };
}

type Counter = 'chats' | 'routes' | 'pokes';
export function bump(key: Counter, n = 1) {
  commit({ ...stats, [key]: stats[key] + n });
}

/** Tagesquiz fertig: zählt einmal pro Tag */
export function recordQuiz(day: string, correct: number) {
  if (stats.quiz[day] !== undefined) return;
  const quiz = Object.fromEntries(Object.entries({ ...stats.quiz, [day]: correct }).sort().slice(-120));
  commit({ ...stats, quiz });
}

export function setPins(n: number) {
  if (n > stats.pins) commit({ ...stats, pins: n });
}

export function markTour() {
  if (!stats.tour) commit({ ...stats, tour: true });
}

export function visitCanton(abbr: string) {
  if (!stats.cantons.includes(abbr)) commit({ ...stats, cantons: [...stats.cantons, abbr] });
}

export interface RoundResult {
  key: string;
  name: string;
  won: boolean;
  team: 'seeker' | 'hider';
  powerups: number;
  traps: number;
  challenges: number;
  finds: number;
  at: number;
}

/** Fertige Runde einmal zählen */
export function recordRound(r: RoundResult) {
  if (stats.recorded.includes(r.key)) return;
  const hour = new Date(r.at).getHours();
  commit({
    ...stats,
    rounds: stats.rounds + 1,
    wins: stats.wins + (r.won ? 1 : 0),
    winsSeeker: stats.winsSeeker + (r.won && r.team === 'seeker' ? 1 : 0),
    winsHider: stats.winsHider + (r.won && r.team === 'hider' ? 1 : 0),
    powerups: stats.powerups + r.powerups,
    traps: stats.traps + r.traps,
    challenges: stats.challenges + r.challenges,
    finds: stats.finds + r.finds,
    nightRounds: stats.nightRounds + (hour >= 22 || hour < 5 ? 1 : 0),
    recorded: [...stats.recorded, r.key].slice(-60),
    history: [{ at: r.at, name: r.name, team: r.team, won: r.won }, ...stats.history].slice(0, 20),
  });
}

// ---------- Einmalige Tipps von Geisti ----------

let seenTips = load<string[]>('tips.v1', []);
const tipListeners = new Set<() => void>();

export function useTipSeen(id: string): [boolean, () => void] {
  const seen = useSyncExternalStore(
    (l) => {
      tipListeners.add(l);
      return () => tipListeners.delete(l);
    },
    () => seenTips.includes(id),
  );
  const dismiss = () => {
    if (seenTips.includes(id)) return;
    seenTips = [...seenTips, id];
    save('tips.v1', seenTips);
    tipListeners.forEach((l) => l());
  };
  return [seen, dismiss];
}

export function resetTips() {
  seenTips = [];
  save('tips.v1', seenTips);
  tipListeners.forEach((l) => l());
}
