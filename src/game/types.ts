export type Team = 'hunter' | 'runner';
export type Phase = 'lobby' | 'running' | 'ended';

/** Was die Gejagten von den Jägern sehen */
export type HunterVisibility = 'live' | 'ping' | 'hidden';

export interface GameSettings {
  /** Spieldauer ab Start, ohne Vorsprung */
  durationMin: number;
  /** Abstand der Standort-Pings der Gejagten */
  pingIntervalMin: number;
  /** Vorsprung der Gejagten: in dieser Zeit warten die Jäger */
  headStartMin: number;
  hunterVisibility: HunterVisibility;
  /** Gefangene wechseln zu den Jägern */
  caughtBecomeHunters: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  durationMin: 180,
  pingIntervalMin: 15,
  headStartMin: 10,
  hunterVisibility: 'live',
  caughtBecomeHunters: false,
};

/** Vom Host verwaltet, als «retained» Nachricht gespeichert */
export interface GameMeta {
  v: 1;
  name: string;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  teams: Record<string, Team>;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  endReason?: 'time' | 'all-caught' | 'host';
}

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
  t: number;
}

/** Von jedem Spieler selbst verwaltet, als «retained» Nachricht gespeichert */
export interface PlayerState {
  v: 1;
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  /** Letztes Lebenszeichen */
  seen: number;
  /** Live-Standort (Lobby für alle, im Spiel nur Jäger) */
  pos?: Fix;
  /** Standort beim letzten Ping */
  ping?: Fix & { n: number };
  caughtAt?: number;
  caughtBy?: string;
}

export type GameEvent =
  | { type: 'team-request'; from: string; team: Team; t: number }
  | { type: 'caught'; from: string; by?: string; t: number }
  | { type: 'catch-claim'; from: string; target: string; t: number }
  | { type: 'catch-denied'; from: string; to: string; t: number };

export interface Me {
  id: string;
  name: string;
  color: string;
}
