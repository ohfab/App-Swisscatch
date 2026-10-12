import { useEffect, useRef, useState } from 'react';
import type { GameClient, GameSnapshot } from '../../game/client';
import { inField, POWERUPS, THERMO_MIN_M, TRAPS, REWARD, type ChallengeDef } from '../../game/content';
import { atSpot, priceOf, type ChallengeState, type Derived, type ThermoState } from '../../game/derive';
import { buzz, play } from '../../lib/sound';
import { ChatPanel, useUnreadChat } from './Chat';
import { formatAgo, formatClock, formatTimeOfDay, isOnline } from '../../game/rules';
import type { Team } from '../../game/types';
import type { Position } from '../../hooks/useGeolocation';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { distanceMeters, formatDistance, formatNumber } from '../../lib/geo';
import { GeistiTip } from '../Geisti';
import { Avatar, ConfirmButton, Feed, GpsBadge, GpsHint, PhotoButton, Points, Tabs, TEAM_ICON, TEAM_LABEL } from './common';

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

interface ViewProps {
  client: GameClient;
  snap: GameSnapshot;
  d: Derived;
  now: number;
  position: Position | null;
  onShowPoint: (lat: number, lng: number) => void;
  onToast: (msg: string) => void;
  /** Versteck auf der Karte wählen (bei ungenauem GPS oder am PC) */
  onPickSpot: () => void;
}

// ---------- Gemeinsam ----------

function PlayerList({ snap, d, now, position, onShowPoint }: Pick<ViewProps, 'snap' | 'd' | 'now' | 'position' | 'onShowPoint'>) {
  const myTeam = d.teamOf(snap.me.id);
  const players = Object.values(snap.players).sort((a, b) => a.joinedAt - b.joinedAt);
  return (
    <>
      {(['seeker', 'hider'] as Team[]).map((t) => (
        <div key={t}>
          <h3 className="section-title">
            {TEAM_ICON[t]} {TEAM_LABEL[t]}
          </h3>
          <ul className="players">
            {players
              .filter((p) => d.teamOf(p.id) === t)
              .map((p) => {
                const me = p.id === snap.me.id;
                const showPos = !me && t === myTeam && p.pos;
                const info = [
                  snap.meta?.hostId === p.id ? 'Host' : null,
                  showPos && position ? formatDistance(distanceMeters(position, p.pos!)) : null,
                  !me && !isOnline(p, now) ? `offline ${formatAgo(now - p.seen)}` : null,
                ].filter(Boolean);
                return (
                  <li key={p.id} className="player">
                    <button className="player-main" disabled={!showPos} onClick={() => showPos && onShowPoint(p.pos!.lat, p.pos!.lng)}>
                      <Avatar p={p} team={t} />
                      <span className="player-text">
                        <strong>
                          {p.name}
                          {me && ' (du)'}
                        </strong>
                        {info.length > 0 && <small>{info.join(' · ')}</small>}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      <p className="muted small route-note">Positionen siehst du nur von deinem eigenen Team.</p>
    </>
  );
}

function QuizButtons({ def, picked, onPick, disabled }: { def: ChallengeDef; picked?: string; onPick: (v: string) => void; disabled?: boolean }) {
  if (def.input.kind !== 'choice') return null;
  const correct = def.input.correct;
  return (
    <div className="quiz-options">
      {def.input.options.map((o) => {
        const state = picked === undefined ? '' : o === correct ? 'right' : o === picked ? 'wrong' : '';
        return (
          <button
            key={o}
            className={`quiz-option ${state} ${picked === o ? 'chosen' : ''}`}
            disabled={disabled || picked !== undefined}
            onClick={() => {
              if (correct !== undefined) play(o === correct ? 'right' : 'wrong');
              onPick(o);
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Fänger ----------

function RiddleCard({ client, d, now }: Pick<ViewProps, 'client' | 'd' | 'now'>) {
  const r = d.riddle;
  if (!r) return <p className="muted small route-note">Rätsel gibt es während des Spiels.</p>;
  if (!r.def) return <p className="muted small route-note">Rätsel wird geladen …</p>;
  const attempt = r.attempt;
  return (
    <div className="challenge-card riddle">
      <div className="challenge-head">
        <span className="challenge-icon">🧠</span>
        <div>
          <small>Rätsel #{r.n + 1} · +{REWARD.riddle} P</small>
          <strong>{r.def.prompt}</strong>
        </div>
      </div>
      <QuizButtons
        def={r.def}
        picked={attempt?.value}
        onPick={(value) => {
          const correct = r.def!.input.kind === 'choice' && r.def!.input.correct === value;
          client.addAction({ kind: 'riddle', n: r.n, value, correct });
        }}
      />
      {attempt && (
        <p className={`challenge-done ${attempt.correct ? 'good' : 'bad'}`}>
          {attempt.correct ? `Richtig! +${REWARD.riddle} P fürs Team.` : 'Leider falsch.'} Nächstes Rätsel in {formatClock(r.nextAt - now)}.
        </p>
      )}
      <p className="muted small">Pro Rätsel zählt der erste Versuch aus deinem Team.</p>
    </div>
  );
}

function ThermoCard({ th, d, client, now, position, onToast }: { th: ThermoState; d: Derived; client: GameClient; now: number; position: Position | null; onToast: (m: string) => void }) {
  const moved = position ? distanceMeters(position, th.start) : 0;
  const ready = moved >= THERMO_MIN_M && !!d.spot && !!position;
  const pct = Math.min(100, (moved / THERMO_MIN_M) * 100);
  return (
    <div className={`challenge-card thermo ${ready ? 'urgent' : ''}`}>
      <div className="challenge-head">
        <span className="challenge-icon">🌡️</span>
        <div>
          <small>Thermometer · gestartet {formatTimeOfDay(th.t)}</small>
          <strong>{ready ? 'Bereit – jetzt messen!' : `Geht weiter: ${formatDistance(moved)} von ${formatDistance(THERMO_MIN_M)}`}</strong>
        </div>
      </div>
      <div className="thermo-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <button
        className="wide-btn start"
        disabled={!ready}
        onClick={() => {
          if (!position || !d.spot) return;
          const closer = distanceMeters(position, d.spot.fix) < distanceMeters(th.start, d.spot.fix);
          client.addAction({ kind: 'thermo', powerupId: th.id, lat: position.lat, lng: position.lng, closer });
          const fogged = (d.revealAt[th.id] ?? 0) > now;
          play(fogged ? 'tick' : closer ? 'right' : 'wrong');
          onToast(fogged ? '🌫️ Gemessen – die Antwort kommt nach dem Nebel.' : closer ? '🔥 Wärmer! Ihr seid näher dran.' : '🧊 Kälter! Ihr habt euch entfernt.');
        }}
      >
        🌡️ Messen
      </button>
    </div>
  );
}

export function SeekerView(props: ViewProps) {
  const { client, snap, d, now, position, onToast } = props;
  const [tab, setTab] = usePersistentState<'shop' | 'clues' | 'riddle' | 'team'>('game.tab.seeker', 'shop');
  const seeking = d.stage === 'seeking';
  const jammed = d.jammedUntil !== null;
  const cluesCount = d.feed.filter((f) => f.audience !== 'hider').length;

  const unread = useUnreadChat(snap, d, 'seeker', tab === 'team');
  const [buying, setBuying] = useState(false);
  const buy = async (id: (typeof POWERUPS)[number]['id'], price: number) => {
    setBuying(true);
    try {
      const { computePowerUp } = await import('../../game/facts');
      const result = await computePowerUp(id, d.spot ? { fix: d.spot.fix, facts: d.spot.facts } : null, position);
      client.addAction({ kind: 'powerup', type: id, cost: price, result });
      play(result.type === 'unknown' ? 'wrong' : 'buy');
      onToast(result.type === 'unknown' ? 'Keine Antwort möglich – Punkte zurück.' : result.type === 'thermo-start' ? '🌡️ Thermometer läuft – geht jetzt 1 km weit.' : 'Power-up gekauft!');
      if (result.type !== 'thermo-start') setTab('clues');
    } finally {
      setBuying(false);
    }
  };
  const openThermos = d.thermos.filter((t) => !t.measure);

  return (
    <>
      <div className="team-card seeker">
        <div>
          <small>{TEAM_ICON.seeker} Du bist Fänger</small>
          <strong className="team-card-time">
            {d.stage === 'hiding' ? `Suche in ${formatClock(d.hideEnd - now)}` : `noch ${formatClock(d.seekEnd - now)}`}
          </strong>
          <span>{d.stage === 'hiding' ? 'Wartet, sammelt Punkte – Zeit für einen Kaffee ☕' : `Suchzeit ${formatClock(now - d.hideEnd)}`}</span>
        </div>
        <Points value={d.seekerPoints} />
      </div>

      {d.stage === 'hiding' ? (
        <GeistiTip id="seeker-wait" mood="sleep">
          Die Verstecker suchen sich gerade ein Versteck. Löst in der Zwischenzeit das Rätsel – das gibt Punkte für Power-ups!
        </GeistiTip>
      ) : (
        <GeistiTip id="seeker-hunt" mood="think" magnifier>
          Jetzt gilt’s! Jedes Power-up graut auf der Karte Gebiete aus, wo das Versteck nicht sein kann. Seid ihr dort, meldet ihr «Gefunden!».
        </GeistiTip>
      )}

      {d.frozenUntil && <div className="info-banner bad freeze-banner">🛑 Stopp! Bis {formatTimeOfDay(d.frozenUntil)} stehen bleiben – kein Zug, kein Laufen.</div>}

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'shop', label: 'Power-ups', badge: openThermos.length },
          { id: 'clues', label: 'Hinweise', badge: cluesCount },
          { id: 'riddle', label: 'Rätsel', badge: d.riddle && !d.riddle.attempt ? 1 : 0 },
          { id: 'team', label: 'Team', badge: unread },
        ]}
      />

      {tab === 'shop' && (
        <>
          {!seeking && <div className="info-banner">Power-ups gibt es ab Suchbeginn. Bis dahin sammelt ihr {snap.meta?.settings.seekerPointsPerMin} P pro Minute.</div>}
          {jammed && <div className="info-banner bad">📵 Funkstille bis {formatTimeOfDay(d.jammedUntil!)} – keine Power-ups.</div>}
          {d.inflationUntil && <div className="info-banner bad">💸 Preise +50 % bis {formatTimeOfDay(d.inflationUntil)}.</div>}
          {!d.spot && seeking && <div className="info-banner">Die Verstecker haben noch kein Versteck – Antworten sind erst danach möglich.</div>}
          {position && position.accuracy > 300 && (
            <div className="info-banner">📡 Dein GPS ist ungenau (±{formatDistance(position.accuracy)}). Radar und «Karte halbieren» rechnen mit diesem ungefähren Standort.</div>
          )}
          {openThermos.map((th) => (
            <ThermoCard key={th.id} th={th} d={d} client={client} now={now} position={position} onToast={onToast} />
          ))}
          <ul className="shop">
            {POWERUPS.map((p) => {
              const price = priceOf(d, p.cost);
              const needsPos = p.id.startsWith('radar') || p.id.startsWith('half') || ['thermo', 'higher', 'line'].includes(p.id);
              const reason = !seeking
                ? 'ab Suchbeginn'
                : jammed
                  ? 'Funkstille'
                  : buying
                    ? '…'
                    : d.seekerPoints < price
                      ? `noch ${price - d.seekerPoints} P`
                      : needsPos && !position
                        ? 'Standort fehlt'
                        : p.id === 'thermo' && openThermos.length > 0
                          ? 'läuft schon'
                          : null;
              return (
                <li key={p.id} className="shop-item">
                  <span className="shop-icon">{p.icon}</span>
                  <span className="shop-text">
                    <strong>{p.name}</strong>
                    <small>{p.question}</small>
                  </span>
                  <ConfirmButton disabled={!!reason} confirm={`Kaufen? ${price} P`} onConfirm={() => void buy(p.id, price)}>
                    {reason ?? `${price} P`}
                  </ConfirmButton>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === 'clues' && <Feed items={d.feed} photos={snap.photos} team="seeker" empty="Noch keine Hinweise. Kauft Power-ups oder wartet auf die Challenges der Verstecker." />}
      {tab === 'riddle' && <RiddleCard client={client} d={d} now={now} />}
      {tab === 'team' && (
        <>
          <ChatPanel client={client} snap={snap} d={d} team="seeker" />
          <PlayerList {...props} />
        </>
      )}

      {seeking && (
        <ConfirmButton
          className="found-btn"
          confirm="Sicher? Ihr steht beim Versteck?"
          onConfirm={() => {
            const dist = d.spot && position ? Math.round(distanceMeters(position, d.spot.fix)) : 999_999;
            const acc = position ? Math.round(position.accuracy) : undefined;
            client.addAction({ kind: 'found', dist, lat: position?.lat ?? 0, lng: position?.lng ?? 0, ...(acc !== undefined ? { acc } : {}) });
            const ok = atSpot({ dist, acc });
            play(ok ? 'win' : 'chat');
            onToast(ok ? 'Gefunden! 🎉' : 'Gemeldet – die Verstecker müssen bestätigen.');
          }}
        >
          🎯 Gefunden!
        </ConfirmButton>
      )}
    </>
  );
}

// ---------- Verstecker ----------

function SpotCard({ client, d, now, position, onShowPoint, onToast, onPickSpot }: ViewProps) {
  const [busy, setBusy] = useState<null | 'measuring' | 'facts'>(null);
  const { platform } = useInstallPrompt();
  // Genaueste Messung der letzten 30 Sekunden merken
  const best = useRef<Position | null>(null);
  useEffect(() => {
    if (!position) return;
    const b = best.current;
    if (!b || position.accuracy <= b.accuracy || position.timestamp - b.timestamp > 30_000) best.current = position;
  }, [position]);

  const login = async () => {
    setBusy('measuring');
    try {
      // Bis zu 12 Sekunden auf eine genaue Messung warten
      const until = Date.now() + 12_000;
      while ((best.current?.accuracy ?? Infinity) > 30 && Date.now() < until) await sleep(500);
      const p = best.current;
      if (!p) return;
      setBusy('facts');
      const fix = { lat: p.lat, lng: p.lng, acc: Math.round(p.accuracy), t: client.now() };
      const { spotFacts } = await import('../../game/facts');
      const facts = await spotFacts(fix);
      if (!inField(d.field, facts.canton)) {
        play('wrong');
        onToast(`Ausserhalb des Spielfelds (${facts.cantonName ?? facts.canton}). Erlaubt: ${d.field!.join(', ')}.`);
        return;
      }
      client.logSpot(fix, facts);
      play('pick');
      onToast('Versteck eingeloggt 🏠');
    } finally {
      setBusy(null);
    }
  };

  if (d.spot) {
    const f = d.spot.facts;
    return (
      <div className="spot-card done">
        <div className="spot-head">
          <span>🏠</span>
          <div>
            <strong>Versteck eingeloggt</strong>
            <small>
              {formatTimeOfDay(d.spot.t)}
              {d.spot.auto ? ' · automatisch' : d.spot.manual ? ' · auf der Karte gewählt' : ` · GPS ±${Math.round(d.spot.fix.acc)} m`}
            </small>
          </div>
          <button className="chip" onClick={() => onShowPoint(d.spot!.fix.lat, d.spot!.fix.lng)}>
            Karte
          </button>
        </div>
        <dl className="spot-facts">
          {f.municipality && (
            <div>
              <dt>Gemeinde</dt>
              <dd>{f.municipality}</dd>
            </div>
          )}
          {f.canton && (
            <div>
              <dt>Kanton</dt>
              <dd>{f.cantonName}</dd>
            </div>
          )}
          {f.population !== undefined && (
            <div>
              <dt>Einwohner</dt>
              <dd>{formatNumber(f.population)}</dd>
            </div>
          )}
          {f.altitude !== undefined && (
            <div>
              <dt>Höhe</dt>
              <dd>{formatNumber(f.altitude)} m</dd>
            </div>
          )}
          {f.station && (
            <div>
              <dt>Haltestelle</dt>
              <dd>
                {f.station.name} ({formatDistance(f.station.dist)})
              </dd>
            </div>
          )}
          {f.languages && (
            <div>
              <dt>Sprache</dt>
              <dd>{f.languages.join(', ')}</dd>
            </div>
          )}
        </dl>
        <p className="muted small">Diese Fakten nutzt die App, um die Fragen der Fänger ehrlich zu beantworten.</p>
      </div>
    );
  }
  return (
    <div className="spot-card">
      <div className="spot-head">
        <span>📍</span>
        <div>
          <strong>Versteck einloggen</strong>
          <small>{d.stage === 'hiding' ? `bis ${formatTimeOfDay(d.hideEnd)} (noch ${formatClock(d.hideEnd - now)})` : 'Die Zeit ist um – jetzt sofort!'}</small>
        </div>
      </div>
      <p className="small">
        Geht an euren Versteck-Ort und loggt ihn hier ein. Danach könnt ihr ihn nicht mehr ändern. Ohne Login nimmt die App am Ende
        der Versteckzeit euren aktuellen Standort.
      </p>
      {d.field && <p className="small field-note">🗺️ Spielfeld: nur {d.field.join(', ')}</p>}
      {position ? <GpsBadge accuracy={best.current && busy ? best.current.accuracy : position.accuracy} /> : <span className="gps-badge bad">Noch kein GPS-Signal</span>}
      {(!position || position.accuracy > 150) && <GpsHint platform={platform} />}
      <div className={`spot-actions ${!position || position.accuracy > 150 ? 'map-first' : ''}`}>
        <ConfirmButton className="spot-btn" disabled={!position || !!busy} confirm="Endgültig hier einloggen?" onConfirm={() => void login()}>
          {busy === 'measuring'
            ? `GPS wird verfeinert … ±${Math.round(best.current?.accuracy ?? position?.accuracy ?? 0)} m`
            : busy === 'facts'
              ? 'Ermittle Ort …'
              : position
                ? '📍 Hier einloggen'
                : 'Warte auf GPS …'}
        </ConfirmButton>
        <button className="wide-btn secondary" disabled={!!busy} onClick={onPickSpot}>
          🗺️ Auf der Karte wählen
        </button>
      </div>
    </div>
  );
}

function ChallengeCard({ c, client, now, onToast }: { c: ChallengeState; client: GameClient; now: number; onToast: (m: string) => void }) {
  const [text, setText] = useState('');
  const def = c.def;
  if (!def) return <p className="muted small route-note">Challenge wird geladen …</p>;
  const done = c.done;
  const answer = (a: Parameters<GameClient['addAction']>[0]) => {
    client.addAction(a);
    onToast('Challenge erledigt ✅');
  };
  if (c.skipped) {
    return (
      <div className="challenge-card skipped">
        <div className="challenge-head">
          <span className="challenge-icon">🎩</span>
          <div>
            <small>Challenge #{c.n} · Tarnkappe</small>
            <strong>Diese Challenge fällt aus – ihr müsst nichts tun.</strong>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`challenge-card ${def.quiz ? 'quiz' : 'clue'}`}>
      <div className="challenge-head">
        <span className="challenge-icon">{def.icon}</span>
        <div>
          <small>
            Challenge #{c.n} · {def.quiz ? 'Quiz – verrät nichts' : 'Hinweis für die Fänger'}
          </small>
          <strong>{def.prompt}</strong>
        </div>
      </div>
      {!done && <div className="challenge-timer">⏱️ noch {formatClock(c.deadline - now)} · sonst +{REWARD.missedChallenge} P für die Fänger</div>}
      {def.input.kind === 'choice' && (
        <QuizButtons
          def={def}
          picked={done?.answer.kind === 'choice' ? done.answer.value : undefined}
          onPick={(value) => {
            const correct = def.input.kind === 'choice' && def.input.correct ? def.input.correct === value : undefined;
            answer({ kind: 'challenge', n: c.n, answer: { kind: 'choice', value, ...(correct !== undefined ? { correct } : {}) } });
          }}
        />
      )}
      {def.input.kind === 'text' && !done && (
        <form
          className="challenge-text"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) answer({ kind: 'challenge', n: c.n, answer: { kind: 'text', value: text.trim() } });
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={def.input.placeholder} inputMode={def.input.numeric ? 'numeric' : 'text'} maxLength={80} />
          <button className="wide-btn" disabled={!text.trim()}>
            Senden
          </button>
        </form>
      )}
      {def.input.kind === 'photo' && !done && (
        <PhotoButton
          onPhoto={async (data) => {
            const photoId = await client.uploadPhoto(data);
            answer({ kind: 'challenge', n: c.n, answer: { kind: 'photo', photoId } });
          }}
        />
      )}
      {done && (
        <p className="challenge-done good">
          Erledigt{done.answer.kind === 'text' ? `: «${done.answer.value}»` : ''} · +{c.reward} P
        </p>
      )}
    </div>
  );
}

export function HiderView(props: ViewProps) {
  const { client, snap, d, now, onToast } = props;
  const [tab, setTab] = usePersistentState<'challenge' | 'traps' | 'clues' | 'team'>('game.tab.hider', 'challenge');
  const seeking = d.stage === 'seeking';
  const openRequests = d.photoRequests.filter((r) => !r.answer && !r.missed);
  const current = d.current;
  const nextChallengeAt = current ? current.deadline : null;
  const unread = useUnreadChat(snap, d, 'hider', tab === 'team');

  return (
    <>
      <div className="team-card hider">
        <div>
          <small>{TEAM_ICON.hider} Du versteckst dich</small>
          <strong className="team-card-time">
            {d.stage === 'hiding' ? `Versteckzeit ${formatClock(d.hideEnd - now)}` : `versteckt ${formatClock(now - d.hideEnd)}`}
          </strong>
          <span>{d.stage === 'hiding' ? 'Danach beginnt die Suche' : `Noch ${formatClock(d.seekEnd - now)} durchhalten bis zum Sieg`}</span>
        </div>
        <Points value={d.hiderPoints} />
      </div>

      {d.stage === 'hiding' ? (
        <GeistiTip id="hider-hide" mood="hide">
          Pssst! Such dir ein Versteck und logg es ein, bevor die Zeit abläuft. Den Fängern verrate ich nur, was sie mit Power-ups kaufen.
        </GeistiTip>
      ) : (
        <GeistiTip id="hider-traps" mood="wink">
          Die Fänger sind unterwegs! Löst die Challenges, sonst bekommen sie Gratis-Hinweise. Mit euren Punkten stellt ihr Fallen.
        </GeistiTip>
      )}

      <SpotCard {...props} />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'challenge', label: 'Challenge', badge: (current && !current.done && !current.skipped ? 1 : 0) + openRequests.length },
          { id: 'traps', label: 'Fallen' },
          { id: 'clues', label: 'Hinweise' },
          { id: 'team', label: 'Team', badge: unread },
        ]}
      />

      {tab === 'challenge' && (
        <>
          {openRequests.map((r) => (
            <div key={r.id} className="challenge-card clue urgent">
              <div className="challenge-head">
                <span className="challenge-icon">📸</span>
                <div>
                  <small>Foto-Anfrage der Fänger · +{REWARD.photo} P</small>
                  <strong>Schickt ein Foto eurer Umgebung.</strong>
                </div>
              </div>
              <div className="challenge-timer">⏱️ noch {formatClock(r.deadline - now)}</div>
              <PhotoButton
                onPhoto={async (data) => {
                  const photoId = await client.uploadPhoto(data);
                  client.addAction({ kind: 'photo-answer', requestId: r.id, photoId });
                  onToast('Foto geschickt 📸');
                }}
              />
            </div>
          ))}
          {current ? <ChallengeCard key={current.n} c={current} client={client} now={now} onToast={onToast} /> : <p className="muted small route-note">Gleich kommt die erste Challenge.</p>}
          {current?.done && nextChallengeAt && <p className="muted small route-note">Nächste Challenge in {formatClock(nextChallengeAt - now)}.</p>}
          {d.challenges.length > 1 && (
            <>
              <h3 className="section-title">Bisher</h3>
              <ul className="history">
                {d.challenges
                  .slice(0, -1)
                  .reverse()
                  .map((c) => (
                    <li key={c.n} className={c.done || c.skipped ? 'good' : 'bad'}>
                      <span>{c.skipped ? '🎩' : (c.def?.icon ?? '•')}</span>
                      <span>{c.def?.title ?? `Challenge ${c.n}`}</span>
                      <strong>{c.done ? `+${c.reward} P` : c.skipped ? 'übersprungen' : 'verpasst'}</strong>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      )}

      {tab === 'traps' && (
        <>
          {!seeking && <div className="info-banner">Fallen könnt ihr ab Suchbeginn stellen. Sammelt bis dahin Punkte mit den Challenges.</div>}
          <ul className="shop">
            {TRAPS.map((t) => {
              const reason = !seeking ? 'ab Suchbeginn' : d.hiderPoints < t.cost ? `noch ${t.cost - d.hiderPoints} P` : null;
              return (
                <li key={t.id} className="shop-item">
                  <span className="shop-icon">{t.icon}</span>
                  <span className="shop-text">
                    <strong>{t.name}</strong>
                    <small>{t.effect}</small>
                  </span>
                  <ConfirmButton
                    disabled={!!reason}
                    confirm={`Stellen? ${t.cost} P`}
                    onConfirm={() => {
                      client.addAction({ kind: 'trap', type: t.id, cost: t.cost });
                      play('trap');
                      buzz(80);
                      onToast(`${t.icon} Falle gestellt!`);
                    }}
                  >
                    {reason ?? `${t.cost} P`}
                  </ConfirmButton>
                </li>
              );
            })}
          </ul>
          {(d.jammedUntil || d.inflationUntil || d.frozenUntil || d.fogArmed > 0 || d.cloaksArmed > 0) && (
            <div className="info-banner">
              Aktiv:{' '}
              {[
                d.jammedUntil && `Funkstille bis ${formatTimeOfDay(d.jammedUntil)}`,
                d.inflationUntil && `Preiserhöhung bis ${formatTimeOfDay(d.inflationUntil)}`,
                d.frozenUntil && `Stopp für die Fänger bis ${formatTimeOfDay(d.frozenUntil)}`,
                d.fogArmed > 0 && 'Nebel wartet auf das nächste Power-up',
                d.cloaksArmed > 0 && 'Tarnkappe für die nächste Challenge',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </>
      )}

      {tab === 'clues' && <Feed items={d.feed} photos={snap.photos} team="hider" empty="Noch nichts passiert. Hier seht ihr, was die Fänger über euch wissen." />}
      {tab === 'team' && (
        <>
          <ChatPanel client={client} snap={snap} d={d} team="hider" />
          <PlayerList {...props} />
        </>
      )}
    </>
  );
}
