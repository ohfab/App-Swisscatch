export type Team = 'seeker' | 'hider';
export type Phase = 'lobby' | 'running' | 'ended';
/** Abgeleiteter Spielabschnitt (aus Phase und Uhrzeit) */
export type Stage = 'lobby' | 'draw' | 'versus' | 'hiding' | 'seeking' | 'ended';

export interface GameSettings {
  /** Sobald so viele Spieler da sind, wird ausgelost */
  maxPlayers: number;
  /** Versteckzeit: so lange haben die Verstecker Zeit, ihr Versteck einzuloggen */
  hideMin: number;
  /** Maximale Suchzeit; danach gewinnen die Verstecker */
  seekMaxMin: number;
  /** Alle so viele Minuten bekommen die Verstecker eine Challenge */
  challengeEveryMin: number;
  /** Punkte pro Minute für die Fänger */
  seekerPointsPerMin: number;
  /** Startguthaben der Fänger */
  seekerStartPoints: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 4,
  hideMin: 90,
  seekMaxMin: 180,
  challengeEveryMin: 10,
  seekerPointsPerMin: 1,
  seekerStartPoints: 20,
};

export interface DrawInfo {
  /** Zufallswert für Rad-Animation, Challenges und Rätsel */
  seed: string;
  /** Alle Spieler in der Reihenfolge auf dem Rad */
  order: string[];
  /** Gezogene Verstecker, in der Reihenfolge der Ziehung */
  hiders: string[];
  /** Start der Animation */
  at: number;
}

/** Vom Host verwaltet, als «retained» Nachricht gespeichert */
export interface GameMeta {
  v: 2;
  rev: number;
  /** Zählt die Runden; Aktionen aus alten Runden werden ignoriert */
  round: number;
  name: string;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  createdAt: number;
  draw?: DrawInfo;
  /** Beginn der Versteckzeit (nach Auslosung und Versus-Screen) */
  startedAt?: number;
  endedAt?: number;
  endReason?: 'found' | 'time' | 'host';
  /** Verstecker der letzten Runde, für «Rollen tauschen» */
  lastHiders?: string[];
}

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
  t: number;
}

/** Fakten zum Versteck, beim Einloggen ermittelt; daraus entstehen die Power-up-Antworten */
export interface SpotFacts {
  canton?: string;
  cantonName?: string;
  municipality?: string;
  bfs?: number;
  population?: number;
  languages?: string[];
  altitude?: number;
  station?: { name: string; dist: number };
}

export type PowerUpId =
  | 'radar-2'
  | 'radar-10'
  | 'radar-50'
  | 'half-ns'
  | 'half-ew'
  | 'altitude'
  | 'population'
  | 'station'
  | 'language'
  | 'canton'
  | 'photo';

export type TrapId = 'jam' | 'inflation' | 'steal' | 'fog';

export type PowerUpResult =
  | { type: 'radar'; inside: boolean; km: number; lat: number; lng: number }
  | { type: 'half'; axis: 'ns' | 'ew'; side: 'north' | 'south' | 'east' | 'west'; lat: number; lng: number }
  | { type: 'altitude'; above: boolean; threshold: number }
  | { type: 'population'; more: boolean; threshold: number }
  | { type: 'station'; near: boolean; threshold: number }
  | { type: 'language'; languages: string[] }
  | { type: 'canton'; abbr: string; name: string }
  | { type: 'photo' }
  | { type: 'unknown' };

export type ChallengeAnswer =
  | { kind: 'choice'; value: string; correct?: boolean }
  | { kind: 'text'; value: string }
  | { kind: 'photo'; photoId: string };

interface Base {
  id: string;
  t: number;
  round: number;
}

export type Action =
  | (Base & { kind: 'spot'; fix: Fix; facts: SpotFacts; auto?: boolean })
  | (Base & { kind: 'powerup'; type: PowerUpId; cost: number; result: PowerUpResult })
  | (Base & { kind: 'challenge'; n: number; answer: ChallengeAnswer })
  | (Base & { kind: 'photo-answer'; requestId: string; photoId: string })
  | (Base & { kind: 'riddle'; n: number; value: string; correct: boolean })
  | (Base & { kind: 'trap'; type: TrapId; cost: number })
  | (Base & { kind: 'found'; dist: number; lat: number; lng: number })
  | (Base & { kind: 'confirm-found'; claimId: string });

/** Von jedem Spieler selbst verwaltet, als «retained» Nachricht gespeichert */
export interface PlayerState {
  v: 2;
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  /** Letztes Lebenszeichen */
  seen: number;
  /** Live-Standort (nur fürs eigene Team sichtbar) */
  pos?: Fix;
  actions: Action[];
}

export interface Me {
  id: string;
  name: string;
  color: string;
}
