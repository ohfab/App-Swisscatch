import type { Fix, GameMeta, PlayerState, Team } from './types';

const MIN = 60_000;

/** Zeitpunkt, ab dem die Jäger losdürfen */
export const huntStart = (m: GameMeta) => (m.startedAt ?? 0) + m.settings.headStartMin * MIN;
/** Ende des Spiels (Dauer zählt ab Ende des Vorsprungs) */
export const gameEnd = (m: GameMeta) => huntStart(m) + m.settings.durationMin * MIN;

/** Nummer des letzten fälligen Pings (−1 = noch keiner) */
export function pingIndex(m: GameMeta, now = Date.now()): number {
  if (m.phase !== 'running' || !m.startedAt) return -1;
  const since = now - huntStart(m);
  if (since < 0) return -1;
  return Math.floor(since / (m.settings.pingIntervalMin * MIN));
}

export function nextPingAt(m: GameMeta, now = Date.now()): number | null {
  if (m.phase !== 'running' || !m.startedAt) return null;
  const n = pingIndex(m, now) + 1;
  const t = huntStart(m) + n * m.settings.pingIntervalMin * MIN;
  return t < gameEnd(m) ? t : null;
}

export const teamOf = (m: GameMeta | null, id: string): Team => m?.teams[id] ?? 'runner';

export interface Visible {
  fix: Fix;
  kind: 'live' | 'ping';
  pingNo?: number;
}

/** Welche Position eines Mitspielers ein Betrachter sehen darf */
export function visibleFix(m: GameMeta, viewerTeam: Team, p: PlayerState): Visible | null {
  const team = teamOf(m, p.id);
  if (m.phase === 'lobby' || m.phase === 'ended') {
    if (p.pos) return { fix: p.pos, kind: 'live' };
    if (p.ping) return { fix: p.ping, kind: 'ping', pingNo: p.ping.n };
    return null;
  }
  if (team === 'hunter') {
    if (viewerTeam === 'hunter' || m.settings.hunterVisibility === 'live') return p.pos ? { fix: p.pos, kind: 'live' } : null;
    if (m.settings.hunterVisibility === 'ping') return p.ping ? { fix: p.ping, kind: 'ping', pingNo: p.ping.n } : null;
    return null;
  }
  // Gejagte sind für alle nur beim Ping sichtbar
  return p.ping ? { fix: p.ping, kind: 'ping', pingNo: p.ping.n } : null;
}

/** Darf dieser Spieler gerade seinen Live-Standort senden? */
export function sendsLive(m: GameMeta | null, team: Team): boolean {
  if (!m || m.phase === 'lobby') return true;
  if (m.phase === 'ended') return false;
  return team === 'hunter';
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  return `vor ${h} h ${m % 60} Min`;
}

/** Spieler gilt als offline, wenn länger kein Lebenszeichen kam */
export const isOnline = (p: PlayerState, now = Date.now()) => now - p.seen < 2.5 * MIN;
