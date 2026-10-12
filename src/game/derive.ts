import type { CantonProps } from '../lib/cantons';
import {
  challengeFor,
  FOG_DELAY_MIN,
  FOUND_GPS_TOLERANCE_M,
  FOUND_RADIUS_M,
  PHOTO_DEADLINE_MIN,
  powerUp,
  REWARD,
  RIDDLE_EVERY_MIN,
  riddleFor,
  trap,
  type ChallengeDef,
} from './content';
import type { Action, GameMeta, PlayerState, PowerUpResult, Stage, Team } from './types';

export const MIN = 60_000;
const DRAW_INTRO = 1400;
const DRAW_STEP = 3800;
const DRAW_OUTRO = 1600;
export const VERSUS_MS = 6500;

export type WithBy<A> = A & { by: string };
type Act<K extends Action['kind']> = WithBy<Extract<Action, { kind: K }>>;

/** Dauer der Rad-Animation für eine Anzahl gezogener Verstecker */
export const drawDuration = (hiders: number) => DRAW_INTRO + hiders * DRAW_STEP + DRAW_OUTRO;
export const drawStepTimes = { intro: DRAW_INTRO, step: DRAW_STEP };

export interface ChallengeState {
  n: number;
  def: ChallengeDef | null;
  start: number;
  deadline: number;
  inHiding: boolean;
  done: Act<'challenge'> | null;
  missed: boolean;
  /** Durch die Falle «Tarnkappe» übersprungen */
  skipped: boolean;
  reward: number;
}

export interface ThermoState {
  id: string;
  by: string;
  t: number;
  start: { lat: number; lng: number };
  measure: Act<'thermo'> | null;
}

export interface ChatMessage {
  id: string;
  by: string;
  t: number;
  text: string;
  audience: 'all' | Team;
}

export interface PhotoRequest {
  id: string;
  by: string;
  t: number;
  deadline: number;
  answer: Act<'photo-answer'> | null;
  missed: boolean;
}

export interface FeedItem {
  id: string;
  t: number;
  icon: string;
  title: string;
  text?: string;
  photoId?: string;
  /** Wer den Eintrag sieht */
  audience: 'all' | Team;
  tone?: 'good' | 'bad' | 'info';
}

export type Area =
  | { kind: 'circle'; lat: number; lng: number; km: number; inside: boolean }
  | { kind: 'half'; axis: 'ns' | 'ew'; side: 'north' | 'south' | 'east' | 'west'; lat: number; lng: number }
  | { kind: 'canton'; abbr: string }
  /** Thermometer: Mittelsenkrechte zwischen a (Start) und b (Messung); das Versteck liegt näher bei `closer` */
  | { kind: 'bisector'; a: { lat: number; lng: number }; b: { lat: number; lng: number }; closer: 'a' | 'b' }
  /** Spielfeld: nur diese Kantone sind erlaubt */
  | { kind: 'cantons'; abbrs: string[] };

export interface Result {
  winner: Team | null;
  reason: 'found' | 'time' | 'host';
  at: number;
  /** Wie lange die Verstecker nach Ende der Versteckzeit unentdeckt blieben */
  hiddenMs: number;
  finder?: string;
}

export interface Derived {
  stage: Stage;
  round: number;
  hiders: string[];
  seekers: string[];
  teamOf: (id: string) => Team;
  drawEnd: number;
  hideStart: number;
  hideEnd: number;
  seekEnd: number;
  actions: WithBy<Action>[];
  spot: Act<'spot'> | null;
  seekerPoints: number;
  hiderPoints: number;
  priceFactor: number;
  jammedUntil: number | null;
  inflationUntil: number | null;
  frozenUntil: number | null;
  fogArmed: number;
  /** Tarnkappen, die noch auf die nächste Challenge warten */
  cloaksArmed: number;
  thermos: ThermoState[];
  chat: ChatMessage[];
  /** Spielfeld (Kantonskürzel) oder null für die ganze Schweiz */
  field: string[] | null;
  challenges: ChallengeState[];
  current: ChallengeState | null;
  photoRequests: PhotoRequest[];
  riddle: { n: number; def: ChallengeDef | null; attempt: Act<'riddle'> | null; nextAt: number } | null;
  pendingClaims: Act<'found'>[];
  feed: FeedItem[];
  areas: Area[];
  result: Result | null;
  /** Zeitpunkt, zu dem eine Power-up-Antwort sichtbar wird (Nebel) */
  revealAt: Record<string, number>;
}

/** «Gefunden!» gilt automatisch, wenn die Fänger nah genug sind (ungenaues GPS etwas berücksichtigt) */
export const atSpot = (f: { dist: number; acc?: number }) => f.dist - Math.min(f.acc ?? 0, FOUND_GPS_TOLERANCE_M) <= FOUND_RADIUS_M;

const fmtTime = (t: number) =>
  new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(t);

export function describeResult(r: PowerUpResult): string {
  switch (r.type) {
    case 'radar':
      return r.inside ? `Ja – das Versteck liegt im Umkreis von ${r.km} km.` : `Nein – das Versteck ist weiter als ${r.km} km weg.`;
    case 'half':
      return `Das Versteck liegt ${{ north: 'nördlich', south: 'südlich', east: 'östlich', west: 'westlich' }[r.side]} vom Standort der Abfrage.`;
    case 'altitude':
      return r.above ? `Über ${r.threshold} m ü. M.` : `Unter ${r.threshold} m ü. M.`;
    case 'population':
      return r.more ? `Mehr als ${r.threshold.toLocaleString('de-CH')} Einwohner.` : `Weniger als ${r.threshold.toLocaleString('de-CH')} Einwohner.`;
    case 'station':
      return r.near ? `Ja – eine Haltestelle ist näher als ${r.threshold} m.` : `Nein – die nächste Haltestelle ist weiter als ${r.threshold} m.`;
    case 'language':
      return `Man spricht ${r.languages.join(' und ')}.`;
    case 'canton':
      return `Kanton ${r.name} (${r.abbr}).`;
    case 'photo':
      return 'Foto angefordert.';
    case 'higher':
      return r.higher ? `Höher als du (du bist auf ${r.mine} m ü. M.).` : `Tiefer als du (du bist auf ${r.mine} m ü. M.).`;
    case 'water':
      return r.near ? 'Ja – ein See oder grosser Fluss ist im Umkreis von 1 km.' : 'Nein – kein See und kein grosser Fluss im Umkreis von 1 km.';
    case 'letter':
      return r.firstHalf ? 'Der Gemeindename beginnt mit A–M.' : 'Der Gemeindename beginnt mit N–Z.';
    case 'thermo-start':
      return 'Thermometer gestartet – geht mindestens 1 km weit und messt dann.';
    case 'line':
      return r.shared.length
        ? `Ja – ${r.shared.slice(0, 3).join(', ')} ${r.shared.length === 1 ? 'hält' : 'halten'} auch beim Versteck (ab ${r.station}).`
        : `Nein – keine Linie von ${r.station} hält beim Versteck.`;
    default:
      return 'Unbekannt – die Punkte gibt es zurück.';
  }
}

export function derive(meta: GameMeta | null, players: Record<string, PlayerState>, now: number, cantons: CantonProps[] | null): Derived | null {
  if (!meta) return null;
  const s = meta.settings;
  const draw = meta.draw;
  const hiders = meta.phase === 'lobby' ? [] : (draw?.hiders ?? []);
  const teamOf = (id: string): Team => (hiders.includes(id) ? 'hider' : 'seeker');
  const seekers = Object.keys(players).filter((id) => teamOf(id) === 'seeker');
  const hideStart = meta.startedAt ?? Infinity;
  const drawEnd = draw ? draw.at + drawDuration(draw.hiders.length) : Infinity;
  const hideEnd = hideStart + s.hideMin * MIN;
  const seekEnd = hideEnd + s.seekMaxMin * MIN;

  const actions: WithBy<Action>[] = Object.values(players)
    .flatMap((p) => (p.actions ?? []).filter((a) => a.round === meta.round).map((a) => ({ ...a, by: p.id })))
    .sort((a, b) => a.t - b.t);
  const of = <K extends Action['kind']>(k: K) => actions.filter((a): a is Act<K> => a.kind === k);

  const spot = of('spot').find((a) => teamOf(a.by) === 'hider') ?? null;

  // ---------- Ergebnis ----------
  let result: Result | null = null;
  if (meta.phase !== 'lobby' && Number.isFinite(hideStart)) {
    const claims = of('found').filter((a) => teamOf(a.by) === 'seeker' && a.t >= hideEnd);
    const confirmed = of('confirm-found').filter((a) => teamOf(a.by) === 'hider');
    const success = claims.find((c) => atSpot(c)) ?? claims.find((c) => confirmed.some((x) => x.claimId === c.id));
    if (success && success.t <= seekEnd) {
      result = { winner: 'seeker', reason: 'found', at: success.t, hiddenMs: Math.max(0, success.t - hideEnd), finder: success.by };
    } else if (now >= seekEnd) {
      result = { winner: 'hider', reason: 'time', at: seekEnd, hiddenMs: seekEnd - hideEnd };
    } else if (meta.phase === 'ended') {
      const at = meta.endedAt ?? now;
      result = { winner: null, reason: 'host', at, hiddenMs: Math.max(0, at - hideEnd) };
    }
  }
  const endT = result ? result.at : now;

  // ---------- Abschnitt ----------
  let stage: Stage;
  if (meta.phase === 'lobby') stage = 'lobby';
  else if (result || meta.phase === 'ended') stage = 'ended';
  else if (now < drawEnd) stage = 'draw';
  else if (now < hideStart) stage = 'versus';
  else if (now < hideEnd) stage = 'hiding';
  else stage = 'seeking';

  // ---------- Fallen ----------
  const traps = of('trap').filter((a) => teamOf(a.by) === 'hider');
  const activeUntil = (id: 'jam' | 'inflation' | 'freeze', at: number) => {
    const t = traps.filter((x) => x.type === id && x.t <= at && at < x.t + (trap(id).durationMin ?? 0) * MIN).pop();
    return t ? t.t + (trap(id).durationMin ?? 0) * MIN : null;
  };
  const priceFactorAt = (at: number) => (activeUntil('inflation', at) ? 1.5 : 1);

  // ---------- Power-ups (mit Nebel) ----------
  const powerups = of('powerup').filter((a) => teamOf(a.by) === 'seeker');
  const revealAt: Record<string, number> = {};
  let fogArmed = 0;
  const fogTraps = traps.filter((x) => x.type === 'fog');
  const events = [...fogTraps.map((f) => ({ t: f.t, fog: true as const })), ...powerups.map((p) => ({ t: p.t, p }))].sort((a, b) => a.t - b.t);
  for (const e of events) {
    if ('fog' in e) fogArmed++;
    else if (fogArmed > 0) {
      fogArmed--;
      revealAt[e.p.id] = e.p.t + FOG_DELAY_MIN * MIN;
    } else revealAt[e.p.id] = e.p.t;
  }

  // ---------- Foto-Anfragen ----------
  const photoAnswers = of('photo-answer').filter((a) => teamOf(a.by) === 'hider');
  const photoRequests: PhotoRequest[] = powerups
    .filter((p) => p.type === 'photo')
    .map((p) => {
      const deadline = p.t + PHOTO_DEADLINE_MIN * MIN;
      const answer = photoAnswers.find((a) => a.requestId === p.id) ?? null;
      return { id: p.id, by: p.by, t: p.t, deadline, answer, missed: !answer && endT > deadline };
    });

  // ---------- Challenges ----------
  const every = s.challengeEveryMin * MIN;
  const cloakQueue = traps.filter((x) => x.type === 'cloak').map((x) => x.t);
  const challengeActs = of('challenge').filter((a) => teamOf(a.by) === 'hider');
  const challenges: ChallengeState[] = [];
  if (Number.isFinite(hideStart) && draw) {
    for (let n = 1; ; n++) {
      const start = hideStart + (n - 1) * every;
      if (start > Math.min(endT, now) || start >= seekEnd) break;
      const inHiding = start < hideEnd;
      const seekMin = Math.max(0, start - hideEnd) / MIN;
      const def = cantons ? challengeFor(draw.seed, n, inHiding, seekMin, cantons) : null;
      const done = challengeActs.find((a) => a.n === n) ?? null;
      const deadline = start + every;
      // Tarnkappe: die nächste Challenge nach dem Stellen der Falle fällt aus
      const skipped = !done && cloakQueue.length > 0 && cloakQueue[0]! < start;
      if (skipped) cloakQueue.shift();
      let reward = 0;
      if (done) {
        if (done.answer.kind === 'photo') reward = REWARD.photo;
        else if (done.answer.kind === 'choice' && def?.quiz) reward = done.answer.correct ? REWARD.quizCorrect : REWARD.quizWrong;
        else reward = REWARD.clue;
      }
      challenges.push({ n, def, start, deadline, inHiding, done, missed: !done && !skipped && endT > deadline, skipped, reward });
    }
  }
  const current = stage === 'hiding' || stage === 'seeking' ? (challenges[challenges.length - 1] ?? null) : null;
  const cloaksArmed = cloakQueue.length;

  // ---------- Thermometer ----------
  const thermoActs = of('thermo').filter((a) => teamOf(a.by) === 'seeker');
  const thermos: ThermoState[] = powerups
    .filter((p) => p.type === 'thermo' && p.result.type === 'thermo-start')
    .map((p) => {
      const r = p.result as Extract<PowerUpResult, { type: 'thermo-start' }>;
      return { id: p.id, by: p.by, t: p.t, start: { lat: r.lat, lng: r.lng }, measure: thermoActs.find((a) => a.powerupId === p.id) ?? null };
    });

  // ---------- Chat ----------
  const drawAt = draw?.at ?? Infinity;
  const chat: ChatMessage[] = of('chat').map((a) => ({
    id: a.id,
    by: a.by,
    t: a.t,
    text: a.text,
    // In der Lobby lesen alle mit, danach nur das eigene Team
    audience: meta.phase === 'lobby' || a.t < drawAt ? 'all' : teamOf(a.by),
  }));

  // ---------- Rätsel der Fänger ----------
  const riddleActs = of('riddle').filter((a) => teamOf(a.by) === 'seeker');
  let riddle: Derived['riddle'] = null;
  if ((stage === 'hiding' || stage === 'seeking') && draw) {
    const n = Math.floor((now - hideStart) / (RIDDLE_EVERY_MIN * MIN));
    riddle = {
      n,
      def: cantons ? riddleFor(draw.seed, n, cantons) : null,
      attempt: riddleActs.find((a) => a.n === n) ?? null,
      nextAt: hideStart + (n + 1) * RIDDLE_EVERY_MIN * MIN,
    };
  }

  // ---------- Punkte ----------
  const runFor = Math.max(0, Math.min(endT, seekEnd) - hideStart);
  let seekerPoints = 0;
  let hiderPoints = 0;
  if (Number.isFinite(hideStart) && now >= hideStart) {
    seekerPoints = s.seekerStartPoints + Math.floor((runFor / MIN) * s.seekerPointsPerMin);
  }
  seekerPoints += challenges.filter((c) => c.missed).length * REWARD.missedChallenge;
  seekerPoints += riddleActs.filter((a) => a.correct).length * REWARD.riddle;
  for (const p of powerups) {
    const refunded = p.result.type === 'unknown' || photoRequests.some((r) => r.id === p.id && r.missed);
    if (!refunded) seekerPoints -= p.cost;
  }
  seekerPoints += photoRequests.filter((r) => r.missed).length * REWARD.missedChallenge;
  seekerPoints -= traps.filter((x) => x.type === 'steal').length * REWARD.steal;
  hiderPoints += challenges.reduce((sum, c) => sum + c.reward, 0);
  hiderPoints += photoRequests.filter((r) => r.answer).length * REWARD.photo;
  hiderPoints -= traps.reduce((sum, x) => sum + x.cost, 0);

  // ---------- Kartenbereiche für die Fänger ----------
  const areas: Area[] = [];
  for (const p of powerups) {
    if ((revealAt[p.id] ?? 0) > now) continue;
    const r = p.result;
    if (r.type === 'radar') areas.push({ kind: 'circle', lat: r.lat, lng: r.lng, km: r.km, inside: r.inside });
    if (r.type === 'half') areas.push({ kind: 'half', axis: r.axis, side: r.side, lat: r.lat, lng: r.lng });
    if (r.type === 'canton') areas.push({ kind: 'canton', abbr: r.abbr });
  }
  for (const th of thermos) {
    if (!th.measure || (revealAt[th.id] ?? 0) > now) continue;
    areas.push({ kind: 'bisector', a: th.start, b: { lat: th.measure.lat, lng: th.measure.lng }, closer: th.measure.closer ? 'b' : 'a' });
  }

  // ---------- Meldungen ----------
  const name = (id: string) => players[id]?.name ?? 'Jemand';
  const feed: FeedItem[] = [];
  if (spot) {
    const how = spot.auto ? 'Automatisch am Ende der Versteckzeit.' : spot.manual ? `von ${name(spot.by)} · auf der Karte gewählt` : `von ${name(spot.by)}`;
    feed.push({ id: `spot-${spot.id}`, t: spot.t, icon: '🏠', title: 'Versteck eingeloggt', text: how, audience: 'all', tone: 'info' });
  }
  for (const p of powerups) {
    const def = powerUp(p.type);
    const at = revealAt[p.id] ?? p.t;
    const fogged = at > now;
    feed.push({
      id: p.id,
      t: p.t,
      icon: def.icon,
      title: `${def.name} · ${name(p.by)}`,
      text: fogged ? `🌫️ Im Nebel – die Antwort kommt um ${fmtTime(at)}.` : describeResult(p.result) + (p.result.type === 'unknown' ? '' : p.type === 'photo' ? ` (−${p.cost} P, zurück, falls kein Foto kommt)` : ` (−${p.cost} P)`),
      audience: 'all',
      tone: 'info',
    });
  }
  for (const r of photoRequests) {
    if (r.answer) feed.push({ id: `pa-${r.answer.id}`, t: r.answer.t, icon: '📸', title: 'Foto der Verstecker', photoId: r.answer.photoId, audience: 'all', tone: 'info' });
    else if (r.missed) feed.push({ id: `pm-${r.id}`, t: r.deadline, icon: '⏰', title: 'Foto verpasst', text: `Punkte zurück und +${REWARD.missedChallenge} P für die Fänger.`, audience: 'all', tone: 'good' });
  }
  for (const c of challenges) {
    if (c.done && c.def) {
      const a = c.done.answer;
      if (c.def.quiz) {
        feed.push({ id: `c-${c.n}`, t: c.done.t, icon: c.def.icon, title: `Quiz ${a.kind === 'choice' && a.correct ? 'richtig' : 'falsch'} · ${name(c.done.by)}`, text: `+${c.reward} P`, audience: 'hider', tone: 'good' });
      } else {
        feed.push({
          id: `c-${c.n}`,
          t: c.done.t,
          icon: c.def.icon,
          title: c.def.title,
          text: a.kind === 'photo' ? undefined : `${c.def.prompt} → ${a.value}`,
          photoId: a.kind === 'photo' ? a.photoId : undefined,
          audience: 'all',
          tone: 'info',
        });
      }
    } else if (c.missed) {
      feed.push({ id: `cm-${c.n}`, t: c.deadline, icon: '⏰', title: 'Challenge verpasst', text: `+${REWARD.missedChallenge} P für die Fänger`, audience: 'all', tone: 'bad' });
    }
  }
  for (const th of thermos) {
    if (!th.measure) continue;
    const fogged = (revealAt[th.id] ?? 0) > now;
    feed.push({
      id: th.measure.id,
      t: th.measure.t,
      icon: '🌡️',
      title: `Thermometer · ${name(th.measure.by)}`,
      text: fogged ? '🌫️ Im Nebel – die Antwort kommt später.' : th.measure.closer ? '🔥 Wärmer! Ihr seid jetzt näher am Versteck.' : '🧊 Kälter! Ihr habt euch vom Versteck entfernt.',
      audience: 'all',
      tone: 'info',
    });
  }
  for (const c of challenges) {
    if (c.skipped) feed.push({ id: `cs-${c.n}`, t: c.start, icon: '🎩', title: 'Challenge fällt aus', text: 'Die Verstecker tragen eine Tarnkappe.', audience: 'all', tone: 'bad' });
  }
  for (const r of riddleActs) {
    feed.push({ id: r.id, t: r.t, icon: '🧠', title: `Rätsel ${r.correct ? 'gelöst' : 'falsch'} · ${name(r.by)}`, text: r.correct ? `+${REWARD.riddle} P` : 'Keine Punkte', audience: 'seeker', tone: r.correct ? 'good' : 'bad' });
  }
  for (const x of traps) {
    const def = trap(x.type);
    feed.push({ id: x.id, t: x.t, icon: def.icon, title: `Falle: ${def.name}`, text: def.effect, audience: 'all', tone: 'bad' });
  }
  for (const f of of('found')) {
    feed.push({ id: f.id, t: f.t, icon: '🎯', title: `${name(f.by)} meldet: Gefunden!`, text: atSpot(f) ? 'Am Versteck – die Fänger gewinnen!' : 'Wartet auf Bestätigung der Verstecker.', audience: 'all', tone: 'info' });
  }
  feed.sort((a, b) => b.t - a.t);

  const resolvedClaims = new Set(of('confirm-found').map((c) => c.claimId));
  const pendingClaims = of('found').filter((f) => !atSpot(f) && !resolvedClaims.has(f.id) && now - f.t < 15 * MIN);

  const jammedUntil = activeUntil('jam', now);
  const inflationUntil = activeUntil('inflation', now);
  const frozenUntil = activeUntil('freeze', now);

  return {
    stage,
    round: meta.round,
    hiders,
    seekers,
    teamOf,
    drawEnd,
    hideStart,
    hideEnd,
    seekEnd,
    actions,
    spot,
    seekerPoints,
    hiderPoints,
    priceFactor: priceFactorAt(now),
    jammedUntil,
    inflationUntil,
    frozenUntil,
    fogArmed,
    cloaksArmed,
    thermos,
    chat,
    field: meta.field?.length ? meta.field : null,
    challenges,
    current,
    photoRequests,
    riddle,
    pendingClaims,
    feed,
    areas,
    result,
    revealAt,
  };
}

/** Aktueller Preis eines Power-ups */
export const priceOf = (d: Derived, base: number) => Math.ceil(base * d.priceFactor);
