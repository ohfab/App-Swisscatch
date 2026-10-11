import type { MqttClient } from 'mqtt';
import { brokerUrl, TOPIC_PREFIX } from './config';
import { deriveRoom, open, seal, type Room } from './crypto';
import { gameEnd, isOnline, nextPingAt, pingIndex, sendsLive, teamOf } from './rules';
import type { Fix, GameEvent, GameMeta, GameSettings, Me, PlayerState, Team } from './types';
import { distanceMeters } from '../lib/geo';

export type ConnState = 'connecting' | 'online' | 'offline';

export interface GameSnapshot {
  code: string;
  me: Me;
  conn: ConnState;
  meta: GameMeta | null;
  players: Record<string, PlayerState>;
  /** Spiel unter diesem Code nicht gefunden */
  notFound: boolean;
  /** Jemand behauptet, mich gefangen zu haben */
  claim: { by: string; t: number } | null;
  /** Letzte Meldung für einen Hinweis (z.B. «Lisa wurde gefangen») */
  notice: { text: string; t: number } | null;
}

type MetaWithRev = GameMeta & { rev: number };

const LIVE_MIN_INTERVAL = 10_000;
const LIVE_MIN_MOVE = 25;
const HEARTBEAT = 30_000;

export class GameClient {
  private snap: GameSnapshot;
  private listeners = new Set<() => void>();
  private mq: MqttClient | null = null;
  private room: Room | null = null;
  private base = '';
  private mine: PlayerState;
  private lastFix: Fix | null = null;
  private lastLive: { fix: Fix; at: number } | null = null;
  private lastPingSent = -1;
  private pingTimer: number | null = null;
  private intervals: number[] = [];
  private closed = false;
  private create: { name: string; settings: GameSettings } | null;
  private rev = 0;
  private restored = false;

  constructor(code: string, me: Me, create?: { name: string; settings: GameSettings }) {
    this.create = create ?? null;
    const now = Date.now();
    this.mine = { v: 1, id: me.id, name: me.name, color: me.color, joinedAt: now, seen: now };
    this.snap = { code, me, conn: 'connecting', meta: null, players: {}, notFound: false, claim: null, notice: null };
  }

  // ---------- Zustand für React ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private set(patch: Partial<GameSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  private notify(text: string) {
    this.set({ notice: { text, t: Date.now() } });
  }

  get meta(): MetaWithRev | null {
    return this.snap.meta as MetaWithRev | null;
  }

  get myTeam(): Team {
    return teamOf(this.snap.meta, this.mine.id);
  }

  get isHost(): boolean {
    return this.snap.meta?.hostId === this.mine.id;
  }

  // ---------- Verbindung ----------

  async connect() {
    this.room = await deriveRoom(this.snap.code);
    if (this.closed) return;
    this.base = `${TOPIC_PREFIX}/${this.room.id}`;
    // MQTT erst laden, wenn wirklich gespielt wird (hält den App-Start schlank)
    const { default: mqtt } = await import('mqtt');
    if (this.closed) return;
    const mq = mqtt.connect(brokerUrl(), {
      clientId: `sc_${this.mine.id.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 3000,
      connectTimeout: 12_000,
    });
    this.mq = mq;
    mq.on('connect', () => {
      this.set({ conn: 'online' });
      mq.subscribe(`${this.base}/#`, { qos: 1 }, () => {
        // Kurz warten, damit ein früher gespeicherter eigener Stand zuerst ankommt
        window.setTimeout(() => {
          this.restored = true;
          void this.publishMe();
        }, 1200);
        // Gespeicherte Nachrichten kommen direkt nach dem Abonnieren. Fehlt danach das Spiel,
        // wird es neu angelegt (beim Erstellen) oder als «nicht gefunden» gemeldet.
        window.setTimeout(() => {
          if (this.closed || this.snap.meta) return;
          if (this.create) void this.publishMeta(this.initialMeta());
          else this.set({ notFound: true });
        }, 2500);
      });
    });
    mq.on('reconnect', () => this.set({ conn: 'connecting' }));
    mq.on('offline', () => this.set({ conn: 'offline' }));
    mq.on('close', () => !this.closed && this.set({ conn: 'offline' }));
    mq.on('message', (topic, payload) => void this.onMessage(topic, payload.toString()));

    this.intervals.push(window.setInterval(() => void this.publishMe(), HEARTBEAT));
    this.intervals.push(window.setInterval(() => this.tick(), 5000));
  }

  close() {
    this.closed = true;
    this.intervals.forEach((i) => window.clearInterval(i));
    if (this.pingTimer) window.clearTimeout(this.pingTimer);
    this.mq?.end(true);
    this.listeners.clear();
  }

  private initialMeta(): MetaWithRev {
    return {
      v: 1,
      rev: 0,
      name: this.create?.name || 'SwissCatch',
      hostId: this.mine.id,
      phase: 'lobby',
      settings: this.create?.settings ?? (undefined as never),
      teams: { [this.mine.id]: 'hunter' },
      createdAt: Date.now(),
    };
  }

  private async publish(sub: string, data: unknown, retain: boolean) {
    if (!this.mq || !this.room) return;
    const payload = data === null ? '' : await seal(this.room.key, data);
    this.mq.publish(`${this.base}/${sub}`, payload, { qos: 1, retain });
  }

  private async publishMe() {
    // Erst senden, wenn das Spiel existiert (sonst bliebe bei falschem Code ein Eintrag liegen)
    if (this.closed || (!this.snap.meta && !this.create)) return;
    this.mine = { ...this.mine, seen: Date.now() };
    this.set({ players: { ...this.snap.players, [this.mine.id]: this.mine } });
    await this.publish(`p/${this.mine.id}`, this.mine, true);
  }

  private async publishMeta(meta: MetaWithRev) {
    this.rev = Math.max(this.rev, meta.rev) + 1;
    const next = { ...meta, rev: this.rev };
    this.applyMeta(next);
    await this.publish('meta', next, true);
  }

  private async sendEvent(e: GameEvent) {
    await this.publish('e', e, false);
  }

  // ---------- Eingehende Nachrichten ----------

  private async onMessage(topic: string, payload: string) {
    if (!this.room || !topic.startsWith(this.base + '/')) return;
    const rel = topic.slice(this.base.length + 1);
    if (rel.startsWith('p/')) {
      const id = rel.slice(2);
      if (payload === '') {
        if (id === this.mine.id) return;
        const { [id]: _gone, ...rest } = this.snap.players;
        this.set({ players: rest });
        return;
      }
      const p = await open<PlayerState>(this.room.key, payload);
      if (!p || p.id !== id) return;
      if (id === this.mine.id) {
        // Eigener gespeicherter Stand nach dem Neuladen: Beitrittszeit, Ping und Fang übernehmen
        if (!this.restored) {
          this.restored = true;
          this.mine = { ...p, name: this.mine.name, color: this.mine.color, seen: Date.now() };
          this.lastPingSent = p.ping?.n ?? -1;
          void this.publishMe();
        }
        return;
      }
      const prev = this.snap.players[id];
      if (prev && prev.seen > p.seen) return; // ältere Nachricht, die verspätet entschlüsselt wurde
      if (prev && !prev.caughtAt && p.caughtAt) this.notify(`${p.name} wurde gefangen!`);
      this.set({ players: { ...this.snap.players, [id]: p } });
      if (this.isHost) this.hostSync();
      return;
    }
    if (rel === 'meta') {
      if (payload === '') return;
      const m = await open<MetaWithRev>(this.room.key, payload);
      if (!m || (this.meta && m.rev < this.meta.rev)) return;
      this.rev = Math.max(this.rev, m.rev);
      this.applyMeta(m);
      return;
    }
    if (rel === 'e') {
      const e = await open<GameEvent>(this.room.key, payload);
      if (e && e.from !== this.mine.id) this.onEvent(e);
    }
  }

  private applyMeta(m: MetaWithRev) {
    const prev = this.snap.meta;
    this.set({ meta: m, notFound: false });
    // Spiel gefunden: jetzt dem Spiel beitreten (nach dem Wiederherstellen des eigenen Stands)
    if (!prev) window.setTimeout(() => void this.publishMe(), this.restored ? 0 : 1300);
    if (prev?.phase !== m.phase) this.onPhaseChange(prev?.phase, m);
    if (prev && prev.teams[this.mine.id] !== m.teams[this.mine.id] && prev.phase !== 'lobby') {
      this.notify(m.teams[this.mine.id] === 'hunter' ? 'Du bist jetzt Jäger!' : 'Du bist jetzt gejagt!');
    }
    this.schedulePing();
    this.maybePing();
    if (this.isHost) this.hostSync();
  }

  private onPhaseChange(prev: GameMeta['phase'] | undefined, m: GameMeta) {
    if (m.phase === 'running' && prev === 'lobby') {
      this.lastPingSent = -1;
      // Gejagte senden ab jetzt keinen Live-Standort mehr
      if (!sendsLive(m, this.myTeam)) {
        const { pos: _p, ...rest } = this.mine;
        this.mine = rest as PlayerState;
      }
      this.mine = { ...this.mine, ping: undefined, caughtAt: undefined, caughtBy: undefined };
      void this.publishMe();
      if (prev) this.notify(m.settings.headStartMin > 0 ? `Los! ${m.settings.headStartMin} Min Vorsprung für die Gejagten.` : 'Los geht’s!');
    }
    if (m.phase === 'lobby' && prev && prev !== 'lobby') {
      this.mine = { ...this.mine, ping: undefined, caughtAt: undefined, caughtBy: undefined };
      void this.publishMe();
    }
    if (m.phase === 'ended' && prev === 'running') {
      this.notify(m.endReason === 'all-caught' ? 'Alle gefangen – die Jäger gewinnen!' : m.endReason === 'time' ? 'Zeit um – die Gejagten gewinnen!' : 'Das Spiel wurde beendet.');
    }
  }

  private onEvent(e: GameEvent) {
    const name = (id: string) => this.snap.players[id]?.name ?? 'Jemand';
    switch (e.type) {
      case 'team-request':
        if (this.isHost && this.meta?.phase === 'lobby') this.setTeam(e.from, e.team);
        break;
      case 'caught':
        if (this.isHost) this.hostSync();
        break;
      case 'catch-claim':
        if (e.target === this.mine.id && !this.mine.caughtAt) {
          this.set({ claim: { by: e.from, t: e.t } });
          navigator.vibrate?.([200, 100, 200]);
        }
        break;
      case 'catch-denied':
        if (e.to === this.mine.id) this.notify(`${name(e.from)} sagt: nicht gefangen.`);
        break;
    }
  }

  // ---------- Standort ----------

  setPosition(fix: Fix | null) {
    this.lastFix = fix;
    if (!fix || this.closed) return;
    const m = this.snap.meta;
    if (sendsLive(m, this.myTeam) && !this.mine.caughtAt) {
      const last = this.lastLive;
      const due =
        !last || Date.now() - last.at > LIVE_MIN_INTERVAL || distanceMeters(last.fix, fix) > LIVE_MIN_MOVE * 4;
      const moved = !last || distanceMeters(last.fix, fix) > LIVE_MIN_MOVE || Date.now() - last.at > HEARTBEAT;
      if (due && moved) {
        this.lastLive = { fix, at: Date.now() };
        this.mine = { ...this.mine, pos: fix };
        void this.publishMe();
      }
    }
    this.maybePing();
  }

  /** Nach dem Zurückkehren in die App: verpasste Pings sofort nachholen */
  resume() {
    this.maybePing();
    void this.publishMe();
  }

  private maybePing() {
    const m = this.snap.meta;
    if (!m || m.phase !== 'running' || !this.lastFix || this.mine.caughtAt) return;
    const team = this.myTeam;
    const pings = team === 'runner' || m.settings.hunterVisibility === 'ping';
    if (!pings) return;
    const n = pingIndex(m);
    if (n < 0 || n <= this.lastPingSent) return;
    this.lastPingSent = n;
    this.mine = { ...this.mine, ping: { ...this.lastFix, n } };
    void this.publishMe();
  }

  private schedulePing() {
    if (this.pingTimer) window.clearTimeout(this.pingTimer);
    this.pingTimer = null;
    const m = this.snap.meta;
    const at = m ? nextPingAt(m) : null;
    if (at === null) return;
    this.pingTimer = window.setTimeout(() => {
      this.maybePing();
      if (this.myTeam === 'hunter') this.notify('📡 Neue Standorte der Gejagten');
      navigator.vibrate?.(150);
      this.schedulePing();
    }, Math.max(0, at - Date.now()) + 800);
  }

  // ---------- Aktionen ----------

  requestTeam(team: Team) {
    if (this.isHost) this.setTeam(this.mine.id, team);
    else void this.sendEvent({ type: 'team-request', from: this.mine.id, team, t: Date.now() });
  }

  rename(name: string) {
    this.mine = { ...this.mine, name };
    this.set({ me: { ...this.snap.me, name } });
    void this.publishMe();
  }

  reportCaught(by?: string) {
    if (this.mine.caughtAt) return;
    this.mine = { ...this.mine, caughtAt: Date.now(), ...(by ? { caughtBy: by } : {}) };
    this.set({ claim: null });
    void this.publishMe();
    void this.sendEvent({ type: 'caught', from: this.mine.id, ...(by ? { by } : {}), t: Date.now() });
  }

  claimCatch(target: string) {
    void this.sendEvent({ type: 'catch-claim', from: this.mine.id, target, t: Date.now() });
    this.notify(`Fang gemeldet – ${this.snap.players[target]?.name ?? 'Spieler'} muss bestätigen.`);
  }

  denyClaim() {
    const c = this.snap.claim;
    if (!c) return;
    this.set({ claim: null });
    void this.sendEvent({ type: 'catch-denied', from: this.mine.id, to: c.by, t: Date.now() });
  }

  // Host-Aktionen

  setTeam(id: string, team: Team) {
    const m = this.meta;
    if (!m || !this.isHost) return;
    void this.publishMeta({ ...m, teams: { ...m.teams, [id]: team } });
  }

  updateSettings(patch: Partial<GameSettings>) {
    const m = this.meta;
    if (!m || !this.isHost || m.phase !== 'lobby') return;
    void this.publishMeta({ ...m, settings: { ...m.settings, ...patch } });
  }

  renameGame(name: string) {
    const m = this.meta;
    if (!m || !this.isHost) return;
    void this.publishMeta({ ...m, name });
  }

  start() {
    const m = this.meta;
    if (!m || !this.isHost || m.phase !== 'lobby') return;
    void this.publishMeta({ ...m, phase: 'running', startedAt: Date.now(), endedAt: undefined, endReason: undefined });
  }

  end(reason: GameMeta['endReason'] = 'host') {
    const m = this.meta;
    if (!m || !this.isHost || m.phase !== 'running') return;
    void this.publishMeta({ ...m, phase: 'ended', endedAt: Date.now(), endReason: reason });
  }

  newRound() {
    const m = this.meta;
    if (!m || !this.isHost) return;
    void this.publishMeta({ ...m, phase: 'lobby', startedAt: undefined, endedAt: undefined, endReason: undefined });
  }

  async leave() {
    const m = this.meta;
    const others = Object.values(this.snap.players).filter((p) => p.id !== this.mine.id && isOnline(p));
    if (m && this.isHost && others.length) {
      // Host-Rolle an den Spieler übergeben, der am längsten dabei ist
      const next = others.sort((a, b) => a.joinedAt - b.joinedAt)[0]!;
      await this.publishMeta({ ...m, hostId: next.id });
    }
    await this.publish(`p/${this.mine.id}`, null, true);
    window.setTimeout(() => this.close(), 300);
  }

  // ---------- Host-Logik ----------

  /** Neue Spieler einteilen, Gefangene umteilen, Spielende erkennen */
  private hostSync() {
    const m = this.meta;
    if (!m || !this.isHost) return;
    const teams = { ...m.teams };
    let changed = false;
    for (const p of Object.values(this.snap.players)) {
      if (!teams[p.id]) {
        teams[p.id] = 'runner';
        changed = true;
      }
      if (m.phase === 'running' && p.caughtAt && m.settings.caughtBecomeHunters && teams[p.id] === 'runner') {
        teams[p.id] = 'hunter';
        changed = true;
      }
    }
    if (changed) {
      void this.publishMeta({ ...m, teams });
      return;
    }
    if (m.phase === 'running') this.checkEnd(m);
  }

  private checkEnd(m: MetaWithRev) {
    if (Date.now() >= gameEnd(m)) {
      this.end('time');
      return;
    }
    const players = Object.values(this.snap.players);
    const runners = players.filter((p) => m.teams[p.id] === 'runner' || p.caughtAt);
    const free = runners.filter((p) => m.teams[p.id] === 'runner' && !p.caughtAt);
    if (runners.length > 0 && free.length === 0) this.end('all-caught');
  }

  private tick() {
    const m = this.meta;
    if (!m || this.closed) return;
    if (this.isHost) {
      this.hostSync();
      return;
    }
    // Host weg? Der am längsten anwesende Spieler übernimmt.
    const host = this.snap.players[m.hostId];
    if (host && isOnline(host)) return;
    if (!host && Date.now() - (m.createdAt ?? 0) < 60_000) return;
    const online = Object.values(this.snap.players).filter((p) => p.id !== m.hostId && isOnline(p));
    const first = online.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (first?.id === this.mine.id) {
      this.notify('Der Host ist weg – du leitest jetzt das Spiel.');
      void this.publishMeta({ ...m, hostId: this.mine.id });
    }
  }
}
