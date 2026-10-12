import type { MqttClient } from 'mqtt';
import { brokerUrls, TOPIC_PREFIX } from './config';
import { deriveRoom, open, seal, type Room } from './crypto';
import { isOnline } from './rules';
import { derive, drawDuration, VERSUS_MS } from './derive';
import { powerUp, rng, trap } from './content';
import type { Action, DrawInfo, Fix, GameMeta, GameSettings, Me, PlayerState, SpotFacts, Team } from './types';
import { distanceMeters } from '../lib/geo';
import { buzz, type SoundName } from '../lib/sound';

export type ConnState = 'connecting' | 'online' | 'offline';

export interface GameSnapshot {
  code: string;
  me: Me;
  conn: ConnState;
  meta: GameMeta | null;
  players: Record<string, PlayerState>;
  /** Fotos nach ID (Daten-URL) */
  photos: Record<string, string>;
  /** Spiel unter diesem Code nicht gefunden */
  notFound: boolean;
  /** Letzte Meldung für einen Hinweis (mit passendem Ton) */
  notice: { text: string; t: number; sound?: SoundName } | null;
  /** Versatz der eigenen Uhr zur Spieluhr (Uhr des Hosts) in ms */
  clockOffset: number;
}

/** Was eine neue Aktion braucht; ID, Zeit und Runde ergänzt der Client */
export type NewAction = Action extends infer A ? (A extends Action ? Omit<A, 'id' | 't' | 'round'> : never) : never;

const LIVE_MIN_INTERVAL = 10_000;
const LIVE_MIN_MOVE = 25;
const HEARTBEAT = 30_000;

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Messungen für den Uhrabgleich: so viele am Anfang, danach alle 30 s eine */
const SYNC_BURST = 8;
const SYNC_EVERY = 30_000;

export class GameClient {
  private snap: GameSnapshot;
  private listeners = new Set<() => void>();
  /** Verbindungen zu allen Brokern (gesendet wird an alle) */
  private conns: MqttClient[] = [];
  private onlineConns = new Set<MqttClient>();
  private subscribed = false;
  private lastMetaRefresh = 0;
  private room: Room | null = null;
  private base = '';
  private mine: PlayerState;
  private lastFix: Fix | null = null;
  private lastLive: { fix: Fix; at: number } | null = null;
  private intervals: number[] = [];
  private closed = false;
  private create: { name: string; settings: GameSettings } | null;
  private rev = 0;
  private restored = false;
  private autoSpotTried = false;
  /** Uhrabgleich mit dem Host: Messungen (Laufzeit, Versatz) und offene Anfrage */
  private offset = 0;
  private samples: { rtt: number; offset: number }[] = [];
  private syncHost: string | null = null;
  private pendingPing: { n: string; t0: number } | null = null;
  private lastPing = 0;

  constructor(code: string, me: Me, create?: { name: string; settings: GameSettings }) {
    this.create = create ?? null;
    const now = Date.now();
    this.mine = { v: 2, id: me.id, name: me.name, color: me.color, joinedAt: now, seen: now, actions: [] };
    this.snap = { code, me, conn: 'connecting', meta: null, players: {}, photos: {}, notFound: false, notice: null, clockOffset: 0 };
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

  private notify(text: string, vibrate = false, sound?: SoundName) {
    this.set({ notice: { text, t: Date.now(), ...(sound ? { sound } : {}) } });
    if (vibrate) buzz([120, 60, 120]);
  }

  get meta(): GameMeta | null {
    return this.snap.meta;
  }

  get isHost(): boolean {
    return this.snap.meta?.hostId === this.mine.id;
  }

  teamOf(id: string): Team {
    return this.snap.meta?.draw?.hiders.includes(id) && this.snap.meta.phase !== 'lobby' ? 'hider' : 'seeker';
  }

  get myTeam(): Team {
    return this.teamOf(this.mine.id);
  }

  /**
   * Spieluhr: die Uhr des Hosts. Handys und PCs gehen oft ein paar Sekunden falsch;
   * damit Glücksrad, Countdown und Challenges überall gleichzeitig laufen,
   * rechnen alle mit derselben Zeit.
   */
  now(): number {
    return Date.now() + this.offset;
  }

  /** Abgeleiteter Spielstand (ohne Quizfragen, die brauchen Kantonsdaten) */
  derived(now = this.now()) {
    return derive(this.snap.meta, this.snap.players, now, null);
  }

  // ---------- Verbindung ----------

  async connect() {
    this.room = await deriveRoom(this.snap.code);
    if (this.closed) return;
    this.base = `${TOPIC_PREFIX}/${this.room.id}`;
    // MQTT erst laden, wenn wirklich gespielt wird (hält den App-Start schlank)
    const { default: mqtt } = await import('mqtt');
    if (this.closed) return;
    const clientId = `sc_${this.mine.id.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`;
    for (const url of brokerUrls()) {
      const mq = mqtt.connect(url, { clientId, clean: true, keepalive: 30, reconnectPeriod: 3000, connectTimeout: 12_000 });
      this.conns.push(mq);
      mq.on('connect', () => {
        this.onlineConns.add(mq);
        this.updateConn();
        mq.subscribe(`${this.base}/#`, { qos: 1 }, () => this.onFirstSubscribe());
      });
      const down = () => {
        this.onlineConns.delete(mq);
        this.updateConn();
      };
      mq.on('reconnect', down);
      mq.on('offline', down);
      mq.on('close', down);
      mq.on('message', (topic, payload) => void this.onMessage(topic, payload.toString()));
    }

    this.intervals.push(window.setInterval(() => void this.publishMe(), HEARTBEAT));
    this.intervals.push(window.setInterval(() => this.tick(), 3000));
  }

  close() {
    this.closed = true;
    this.intervals.forEach((i) => window.clearInterval(i));
    this.conns.forEach((c) => c.end(true));
    this.listeners.clear();
  }

  private updateConn() {
    if (this.closed) return;
    const conn: ConnState = this.onlineConns.size > 0 ? 'online' : this.conns.some((c) => c.reconnecting) ? 'connecting' : 'offline';
    if (conn !== this.snap.conn) this.set({ conn });
  }

  /** Erste funktionierende Verbindung: eigenen Stand wiederherstellen, Spiel finden oder anlegen */
  private onFirstSubscribe() {
    if (this.subscribed) return;
    this.subscribed = true;
    // Kurz warten, damit ein früher gespeicherter eigener Stand zuerst ankommt
    window.setTimeout(() => {
      this.restored = true;
      void this.publishMe();
    }, 1200);
    window.setTimeout(() => {
      if (this.closed || this.snap.meta) return;
      if (this.create) void this.publishMeta(this.initialMeta());
      else this.set({ notFound: true });
    }, 2500);
  }

  private initialMeta(): GameMeta {
    return {
      v: 2,
      rev: 0,
      round: 1,
      name: this.create?.name || 'Spurlos',
      hostId: this.mine.id,
      phase: 'lobby',
      settings: this.create!.settings,
      createdAt: this.now(),
    };
  }

  private async publish(sub: string, data: unknown, retain: boolean) {
    if (!this.conns.length || !this.room) return;
    const payload = data === null ? '' : await seal(this.room.key, data);
    for (const c of this.conns) c.publish(`${this.base}/${sub}`, payload, { qos: 1, retain });
  }

  private async publishMe() {
    // Erst senden, wenn das Spiel existiert (sonst bliebe bei falschem Code ein Eintrag liegen)
    if (this.closed || (!this.snap.meta && !this.create)) return;
    // Streng steigend, damit andere Geräte neuere Stände nie als Doppel verwerfen
    this.mine = { ...this.mine, seen: Math.max(this.mine.seen + 1, this.now()) };
    this.set({ players: { ...this.snap.players, [this.mine.id]: this.mine } });
    await this.publish(`p/${this.mine.id}`, this.mine, true);
  }

  private async publishMeta(meta: GameMeta) {
    this.rev = Math.max(this.rev, meta.rev) + 1;
    const next = { ...meta, rev: this.rev };
    this.applyMeta(next);
    await this.publish('meta', next, true);
  }

  // ---------- Eingehende Nachrichten ----------

  private async onMessage(topic: string, payload: string) {
    // Ankunftszeit sofort festhalten (für den Uhrabgleich), noch vor dem Entschlüsseln
    const arrival = Date.now();
    if (!this.room || !topic.startsWith(this.base + '/')) return;
    const rel = topic.slice(this.base.length + 1);
    if (rel.startsWith('t/')) {
      void this.onTime(rel, payload, arrival);
      return;
    }
    if (rel.startsWith('img/')) {
      if (!payload) return;
      const img = await open<{ id: string; data: string }>(this.room.key, payload);
      if (img?.data.startsWith('data:image/')) this.set({ photos: { ...this.snap.photos, [img.id]: img.data } });
      return;
    }
    if (rel.startsWith('p/')) {
      const id = rel.slice(2);
      if (payload === '') {
        if (id === this.mine.id) return;
        const { [id]: _gone, ...rest } = this.snap.players;
        this.set({ players: rest });
        return;
      }
      const p = await open<PlayerState>(this.room.key, payload);
      if (!p || p.id !== id || p.v !== 2) return;
      p.actions ??= [];
      if (id === this.mine.id) {
        // Eigener gespeicherter Stand nach dem Neuladen übernehmen
        if (!this.restored) {
          this.restored = true;
          this.mine = { ...p, name: this.mine.name, color: this.mine.color, seen: this.now() };
          void this.publishMe();
        }
        return;
      }
      const prev = this.snap.players[id];
      // Ältere oder doppelte Nachricht (kommt über beide Broker)
      if (prev && prev.seen >= p.seen) return;
      this.announce(prev, p);
      this.set({ players: { ...this.snap.players, [id]: p } });
      if (this.isHost) this.hostSync();
      return;
    }
    if (rel === 'meta') {
      if (payload === '') return;
      const m = await open<GameMeta>(this.room.key, payload);
      if (!m || m.v !== 2 || (this.meta && m.rev <= this.meta.rev)) return;
      this.rev = Math.max(this.rev, m.rev);
      this.applyMeta(m);
    }
  }

  /** Neue Aktionen anderer Spieler als kurze Meldung zeigen */
  private announce(prev: PlayerState | undefined, p: PlayerState) {
    const m = this.snap.meta;
    if (!prev || !m || m.phase === 'ended') return;
    const known = new Set(prev.actions.map((a) => a.id));
    const fresh = p.actions.filter((a) => !known.has(a.id) && a.round === m.round);
    const mineTeam = this.myTeam;
    const theirTeam = this.teamOf(p.id);
    for (const a of fresh) {
      if (a.kind === 'trap' && mineTeam === 'seeker') this.notify(`${trap(a.type).icon} Falle! ${trap(a.type).name}: ${trap(a.type).effect}`, true, 'trap');
      else if (a.kind === 'powerup' && mineTeam === 'hider') this.notify(`${powerUp(a.type).icon} Die Fänger nutzen «${powerUp(a.type).name}».`, a.type === 'photo', a.type === 'photo' ? 'challenge' : 'tick');
      else if (a.kind === 'powerup' && mineTeam === 'seeker') this.notify(`${powerUp(a.type).icon} ${p.name} hat «${powerUp(a.type).name}» gekauft.`, false, 'buy');
      else if (a.kind === 'thermo' && mineTeam === 'hider') this.notify('🌡️ Die Fänger messen mit dem Thermometer.', false, 'tick');
      else if (a.kind === 'challenge' && theirTeam === mineTeam) this.notify(`✅ ${p.name} hat die Challenge erledigt.`, false, 'right');
      else if (a.kind === 'challenge' && mineTeam === 'seeker') this.notify('🕵️ Neuer Hinweis von den Versteckern!', false, 'chat');
      else if (a.kind === 'photo-answer' && mineTeam === 'seeker') this.notify('📸 Die Verstecker haben ein Foto geschickt!', false, 'chat');
      else if (a.kind === 'spot' && mineTeam === 'seeker') this.notify('🏠 Die Verstecker haben ihr Versteck eingeloggt.', false, 'tick');
      else if (a.kind === 'found') this.notify(`🎯 ${p.name} meldet: Gefunden!`, true, 'found');
      else if (a.kind === 'chat' && (a.t < (m.draw?.at ?? Infinity) || theirTeam === mineTeam)) this.notify(`💬 ${p.name}: ${a.text}`, false, 'chat');
    }
  }

  private applyMeta(m: GameMeta) {
    const prev = this.snap.meta;
    this.set({ meta: m, notFound: false });
    // Spiel gefunden: jetzt dem Spiel beitreten (nach dem Wiederherstellen des eigenen Stands)
    if (!prev) {
      window.setTimeout(() => void this.publishMe(), this.restored ? 0 : 1300);
      window.setTimeout(() => this.syncClock(true), 300);
    }
    // Neue Runde: eigene Aktionen der alten Runde verwerfen
    if (this.mine.actions.some((a) => a.round !== m.round)) {
      this.mine = { ...this.mine, actions: this.mine.actions.filter((a) => a.round === m.round) };
      this.autoSpotTried = false;
      void this.publishMe();
    }
    if (this.isHost) this.hostSync();
  }

  // ---------- Uhrabgleich mit dem Host ----------

  /**
   * Nicht-Host: Zeit beim Host anfragen, wie bei NTP. Der Host meldet, wann die Anfrage
   * ankam und wann er antwortete; so fällt seine Bearbeitungszeit aus der Rechnung.
   */
  private syncClock(force = false) {
    const m = this.meta;
    if (!m || this.isHost || !this.conns.length || !this.room || this.closed) return;
    if (this.syncHost !== m.hostId) {
      // Neuer Host: alte Messungen gelten nicht mehr
      this.syncHost = m.hostId;
      this.samples = [];
    }
    const due = force || (this.samples.length < SYNC_BURST ? Date.now() - this.lastPing > 900 : Date.now() - this.lastPing > SYNC_EVERY);
    if (!due) return;
    this.lastPing = Date.now();
    const n = newId();
    const room = this.room;
    void seal(room.key, { n }).then((payload) => {
      if (this.closed) return;
      // Zeitpunkt erst nach dem Verschlüsseln nehmen, direkt vor dem Senden
      this.pendingPing = { n, t0: Date.now() };
      for (const c of this.conns) c.publish(`${this.base}/t/q/${this.mine.id}`, payload, { qos: 0 });
    });
  }

  private async onTime(rel: string, payload: string, arrival: number) {
    if (!payload || !this.room) return;
    const [, dir, id] = rel.split('/');
    if (dir === 'q' && id && this.isHost) {
      const h1 = arrival + this.offset;
      const q = await open<{ n: string }>(this.room.key, payload);
      if (q) void this.publish(`t/a/${id}`, { n: q.n, h1, h2: this.now() }, false);
      return;
    }
    if (dir === 'a' && id === this.mine.id && !this.isHost) {
      const ping = this.pendingPing;
      const a = await open<{ n: string; h1: number; h2: number }>(this.room.key, payload);
      if (!a || !ping || a.n !== ping.n) return;
      this.pendingPing = null;
      const rtt = arrival - ping.t0 - (a.h2 - a.h1);
      if (rtt < 0 || rtt > 10_000) return;
      const offset = (a.h1 - ping.t0 + (a.h2 - arrival)) / 2;
      this.samples = [...this.samples, { rtt, offset }].slice(-16);
      // Die Messung mit der kürzesten Laufzeit ist am genauesten
      const best = this.samples.reduce((x, y) => (y.rtt < x.rtt ? y : x));
      if (Math.abs(best.offset - this.offset) > 10) {
        this.offset = best.offset;
        this.set({ clockOffset: this.offset });
      }
      if (this.samples.length < SYNC_BURST) window.setTimeout(() => this.syncClock(), 1000);
    }
  }

  // ---------- Standort ----------

  setPosition(fix: Fix | null) {
    this.lastFix = fix;
    if (!fix || this.closed) return;
    const last = this.lastLive;
    const due = !last || Date.now() - last.at > LIVE_MIN_INTERVAL || distanceMeters(last.fix, fix) > LIVE_MIN_MOVE * 4;
    const moved = !last || distanceMeters(last.fix, fix) > LIVE_MIN_MOVE || Date.now() - last.at > HEARTBEAT;
    if (due && moved) {
      this.lastLive = { fix, at: Date.now() };
      this.mine = { ...this.mine, pos: fix };
      void this.publishMe();
    }
  }

  get position(): Fix | null {
    return this.lastFix;
  }

  /** Nach dem Zurückkehren in die App sofort aktualisieren */
  resume() {
    void this.publishMe();
    this.tick();
  }

  // ---------- Aktionen ----------

  addAction(a: NewAction): Action {
    const m = this.snap.meta;
    const action = { ...a, id: newId(), t: this.now(), round: m?.round ?? 1 } as Action;
    let actions = [...this.mine.actions, action];
    // Chat begrenzen, damit die gespeicherte Nachricht klein bleibt
    const chats = actions.filter((x) => x.kind === 'chat');
    if (chats.length > 40) {
      const drop = new Set(chats.slice(0, chats.length - 40).map((x) => x.id));
      actions = actions.filter((x) => !drop.has(x.id));
    }
    this.mine = { ...this.mine, actions };
    void this.publishMe();
    return action;
  }

  async uploadPhoto(dataUrl: string): Promise<string> {
    const id = newId();
    this.set({ photos: { ...this.snap.photos, [id]: dataUrl } });
    await this.publish(`img/${id}`, { id, data: dataUrl }, true);
    return id;
  }

  /** Versteck einloggen; `manual`: auf der Karte gewählt statt per GPS */
  logSpot(fix: Fix, facts: SpotFacts, opts: { auto?: boolean; manual?: boolean } = {}) {
    this.addAction({ kind: 'spot', fix, facts, ...(opts.auto ? { auto: true } : {}), ...(opts.manual ? { manual: true } : {}) });
  }

  rename(name: string) {
    this.mine = { ...this.mine, name };
    this.set({ me: { ...this.snap.me, name } });
    void this.publishMe();
  }

  // ---------- Host-Aktionen ----------

  updateSettings(patch: Partial<GameSettings>) {
    const m = this.meta;
    if (!m || !this.isHost || m.phase !== 'lobby') return;
    void this.publishMeta({ ...m, settings: { ...m.settings, ...patch } });
  }

  /** Host: Spielfeld festlegen (Kantonskürzel; leer = ganze Schweiz) */
  updateField(abbrs: string[]) {
    const m = this.meta;
    if (!m || !this.isHost || m.phase !== 'lobby') return;
    void this.publishMeta({ ...m, field: [...new Set(abbrs)].sort() });
  }

  /** Host: Teams auslosen. Mit `swap` verstecken sich die Fänger der letzten Runde. */
  draw(swap = false) {
    const m = this.meta;
    if (!m || !this.isHost || m.phase !== 'lobby') return;
    const ids = Object.values(this.snap.players)
      .filter((p) => isOnline(p, this.now()) || p.id === this.mine.id)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => p.id);
    if (ids.length < 2) return;
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    const r = rng(seed);
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const count = Math.floor(ids.length / 2);
    const last = m.lastHiders ?? [];
    // Beim Tauschen zuerst die bisherigen Fänger ziehen, Rest zufällig
    const preferred = swap ? order.filter((id) => !last.includes(id)) : [];
    const pool = order.filter((id) => !preferred.includes(id));
    const hiders: string[] = [];
    while (hiders.length < count) {
      const from = preferred.length ? preferred : pool;
      hiders.push(from.splice(Math.floor(r() * from.length), 1)[0]!);
    }
    // Etwas Vorlauf, damit die Nachricht auch auf langsamen Handys ankommt, bevor das Rad dreht
    const at = this.now() + 3000;
    const draw: DrawInfo = { seed, order, hiders, at };
    void this.publishMeta({ ...m, phase: 'running', draw, startedAt: at + drawDuration(hiders.length) + VERSUS_MS, endedAt: undefined, endReason: undefined });
  }

  end(reason: GameMeta['endReason'] = 'host') {
    const m = this.meta;
    if (!m || !this.isHost || m.phase !== 'running') return;
    void this.publishMeta({ ...m, phase: 'ended', endedAt: this.now(), endReason: reason });
  }

  newRound() {
    const m = this.meta;
    if (!m || !this.isHost) return;
    void this.publishMeta({ ...m, round: m.round + 1, phase: 'lobby', draw: undefined, startedAt: undefined, endedAt: undefined, endReason: undefined, lastHiders: m.draw?.hiders ?? m.lastHiders });
  }

  async leave() {
    const m = this.meta;
    const others = Object.values(this.snap.players).filter((p) => p.id !== this.mine.id && isOnline(p, this.now()));
    if (m && this.isHost && others.length) {
      // Host-Rolle an den Spieler übergeben, der am längsten dabei ist
      const next = others.sort((a, b) => a.joinedAt - b.joinedAt)[0]!;
      await this.publishMeta({ ...m, hostId: next.id });
    }
    await this.publish(`p/${this.mine.id}`, null, true);
    window.setTimeout(() => this.close(), 300);
  }

  // ---------- Automatik ----------

  /** Host: Lobby voll → auslosen; Spielende festhalten */
  private hostSync() {
    const m = this.meta;
    if (!m || !this.isHost) return;
    // Gespeicherten Spielstand regelmässig auffrischen (z.B. nach dem Ausfall eines Brokers)
    if (Date.now() - this.lastMetaRefresh > 60_000) {
      this.lastMetaRefresh = Date.now();
      void this.publish('meta', m, true);
    }
    if (m.phase === 'lobby') {
      const online = Object.values(this.snap.players).filter((p) => isOnline(p, this.now()) || p.id === this.mine.id);
      // Automatisch nur in der ersten Runde; danach lost der Host von Hand aus
      if (m.round === 1 && online.length >= m.settings.maxPlayers) this.draw();
      return;
    }
    if (m.phase === 'running') {
      const d = this.derived();
      if (d?.result) void this.publishMeta({ ...m, phase: 'ended', endedAt: d.result.at, endReason: d.result.reason });
    }
  }

  private tick() {
    const m = this.meta;
    if (!m || this.closed) return;
    // Versteckzeit abgelaufen ohne Versteck: aktuellen Standort automatisch einloggen
    const d = this.derived();
    if (d && d.stage === 'seeking' && !d.spot && this.myTeam === 'hider' && this.lastFix && !this.autoSpotTried) {
      this.autoSpotTried = true;
      const delay = Math.max(0, d.hiders.indexOf(this.mine.id)) * 4000;
      const fix = this.lastFix;
      window.setTimeout(async () => {
        if (this.derived()?.spot) return;
        const { spotFacts } = await import('./facts');
        const facts = await spotFacts(fix);
        if (!this.derived()?.spot) this.logSpot(fix, facts, { auto: true });
      }, delay);
    }
    if (this.isHost) {
      this.hostSync();
      return;
    }
    this.syncClock();
    // Host weg? Der am längsten anwesende Spieler übernimmt.
    const host = this.snap.players[m.hostId];
    if (host && isOnline(host, this.now())) return;
    if (!host && this.now() - (m.createdAt ?? 0) < 60_000) return;
    const online = Object.values(this.snap.players).filter((p) => p.id !== m.hostId && isOnline(p, this.now()));
    const first = online.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (first?.id === this.mine.id) {
      this.notify('Der Host ist weg – du leitest jetzt das Spiel.');
      void this.publishMeta({ ...m, hostId: this.mine.id });
    }
  }
}
