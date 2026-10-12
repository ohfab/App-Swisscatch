import { useState } from 'react';
import type { GameClient, GameSnapshot } from '../../game/client';
import { POWERUPS, TRAPS, REWARD, FOUND_RADIUS_M, type ChallengeDef } from '../../game/content';
import { priceOf, type ChallengeState, type Derived } from '../../game/derive';
import { formatAgo, formatClock, formatTimeOfDay, isOnline } from '../../game/rules';
import type { Team } from '../../game/types';
import type { Position } from '../../hooks/useGeolocation';
import { usePersistentState } from '../../hooks/usePersistentState';
import { distanceMeters, formatDistance, formatNumber } from '../../lib/geo';
import { Avatar, ConfirmButton, Feed, PhotoButton, Points, Tabs, TEAM_ICON, TEAM_LABEL } from './common';

interface ViewProps {
  client: GameClient;
  snap: GameSnapshot;
  d: Derived;
  now: number;
  position: Position | null;
  onShowPoint: (lat: number, lng: number) => void;
  onToast: (msg: string) => void;
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
          <button key={o} className={`quiz-option ${state} ${picked === o ? 'chosen' : ''}`} disabled={disabled || picked !== undefined} onClick={() => onPick(o)}>
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

export function SeekerView(props: ViewProps) {
  const { client, snap, d, now, position, onToast } = props;
  const [tab, setTab] = usePersistentState<'shop' | 'clues' | 'riddle' | 'team'>('game.tab.seeker', 'shop');
  const seeking = d.stage === 'seeking';
  const jammed = d.jammedUntil !== null;
  const cluesCount = d.feed.filter((f) => f.audience !== 'hider').length;

  const buy = async (id: (typeof POWERUPS)[number]['id'], price: number) => {
    const { computePowerUp } = await import('../../game/facts');
    const result = computePowerUp(id, d.spot ? { fix: d.spot.fix, facts: d.spot.facts } : null, position);
    client.addAction({ kind: 'powerup', type: id, cost: price, result });
    onToast(result.type === 'unknown' ? 'Keine Antwort möglich – Punkte zurück.' : 'Power-up gekauft!');
    setTab('clues');
  };

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

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'shop', label: 'Power-ups' },
          { id: 'clues', label: 'Hinweise', badge: cluesCount },
          { id: 'riddle', label: 'Rätsel', badge: d.riddle && !d.riddle.attempt ? 1 : 0 },
          { id: 'team', label: 'Team' },
        ]}
      />

      {tab === 'shop' && (
        <>
          {!seeking && <div className="info-banner">Power-ups gibt es ab Suchbeginn. Bis dahin sammelt ihr {snap.meta?.settings.seekerPointsPerMin} P pro Minute.</div>}
          {jammed && <div className="info-banner bad">📵 Funkstille bis {formatTimeOfDay(d.jammedUntil!)} – keine Power-ups.</div>}
          {d.inflationUntil && <div className="info-banner bad">💸 Preise +50 % bis {formatTimeOfDay(d.inflationUntil)}.</div>}
          {!d.spot && seeking && <div className="info-banner">Die Verstecker haben noch kein Versteck – Antworten sind erst danach möglich.</div>}
          <ul className="shop">
            {POWERUPS.map((p) => {
              const price = priceOf(d, p.cost);
              const needsPos = p.id.startsWith('radar') || p.id.startsWith('half');
              const reason = !seeking
                ? 'ab Suchbeginn'
                : jammed
                  ? 'Funkstille'
                  : d.seekerPoints < price
                    ? `noch ${price - d.seekerPoints} P`
                    : needsPos && !position
                      ? 'Standort fehlt'
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
      {tab === 'team' && <PlayerList {...props} />}

      {seeking && (
        <ConfirmButton
          className="found-btn"
          confirm="Sicher? Ihr steht beim Versteck?"
          onConfirm={() => {
            const dist = d.spot && position ? Math.round(distanceMeters(position, d.spot.fix)) : 999_999;
            client.addAction({ kind: 'found', dist, lat: position?.lat ?? 0, lng: position?.lng ?? 0 });
            onToast(dist <= FOUND_RADIUS_M ? 'Gefunden! 🎉' : 'Gemeldet – die Verstecker müssen bestätigen.');
          }}
        >
          🎯 Gefunden!
        </ConfirmButton>
      )}
    </>
  );
}

// ---------- Verstecker ----------

function SpotCard({ client, d, now, position, onShowPoint, onToast }: ViewProps) {
  const [busy, setBusy] = useState(false);
  if (d.spot) {
    const f = d.spot.facts;
    return (
      <div className="spot-card done">
        <div className="spot-head">
          <span>🏠</span>
          <div>
            <strong>Versteck eingeloggt</strong>
            <small>{formatTimeOfDay(d.spot.t)}{d.spot.auto ? ' · automatisch' : ''}</small>
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
      {position && position.accuracy > 80 && <p className="small warn-text">GPS ist noch ungenau (±{Math.round(position.accuracy)} m).</p>}
      <ConfirmButton
        className="spot-btn"
        disabled={!position || busy}
        confirm="Endgültig hier einloggen?"
        onConfirm={async () => {
          if (!position) return;
          setBusy(true);
          const fix = { lat: position.lat, lng: position.lng, acc: Math.round(position.accuracy), t: position.timestamp };
          try {
            const { spotFacts } = await import('../../game/facts');
            const facts = await spotFacts(fix);
            client.logSpot(fix, facts);
            onToast('Versteck eingeloggt 🏠');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Ermittle Ort …' : position ? '📍 Hier einloggen' : 'Warte auf GPS …'}
      </ConfirmButton>
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

      <SpotCard {...props} />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'challenge', label: 'Challenge', badge: (current && !current.done ? 1 : 0) + openRequests.length },
          { id: 'traps', label: 'Fallen' },
          { id: 'clues', label: 'Hinweise' },
          { id: 'team', label: 'Team' },
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
                    <li key={c.n} className={c.done ? 'good' : 'bad'}>
                      <span>{c.def?.icon ?? '•'}</span>
                      <span>{c.def?.title ?? `Challenge ${c.n}`}</span>
                      <strong>{c.done ? `+${c.reward} P` : 'verpasst'}</strong>
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
                      onToast(`${t.icon} Falle gestellt!`);
                    }}
                  >
                    {reason ?? `${t.cost} P`}
                  </ConfirmButton>
                </li>
              );
            })}
          </ul>
          {(d.jammedUntil || d.inflationUntil || d.fogArmed > 0) && (
            <div className="info-banner">
              Aktiv:{' '}
              {[
                d.jammedUntil && `Funkstille bis ${formatTimeOfDay(d.jammedUntil)}`,
                d.inflationUntil && `Preiserhöhung bis ${formatTimeOfDay(d.inflationUntil)}`,
                d.fogArmed > 0 && 'Nebel wartet auf das nächste Power-up',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </>
      )}

      {tab === 'clues' && <Feed items={d.feed} photos={snap.photos} team="hider" empty="Noch nichts passiert. Hier seht ihr, was die Fänger über euch wissen." />}
      {tab === 'team' && <PlayerList {...props} />}
    </>
  );
}
