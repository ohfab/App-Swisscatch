import { useState, useSyncExternalStore } from 'react';
import { BottomSheet } from './BottomSheet';
import { CopyIcon, DownloadIcon, FlagIcon, LocateIcon, ShareIcon, UsersIcon } from './Icons';
import type { GeoStatus, Position } from '../hooks/useGeolocation';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { inviteLink, type GameApi } from '../game/useGame';
import { formatClock, isOnline } from '../game/rules';
import type { Derived } from '../game/derive';
import type { GameMeta, GameSettings } from '../game/types';
import type { GameSnapshot } from '../game/client';
import { distanceMeters, formatDistance, formatNumber } from '../lib/geo';
import { normalizeCode, CODE_LENGTH } from '../game/crypto';
import { Avatar, TEAM_ICON, TEAM_LABEL, useCantonProps } from './game/common';
import { ChatPanel } from './game/Chat';
import { REGIONS } from '../game/content';
import { setSoundOn, soundOn, subscribeSound } from '../lib/sound';
import { HiderView, SeekerView } from './game/TeamViews';
import { Blob } from './Art';

interface Props {
  game: GameApi;
  d: Derived | null;
  now: number;
  prefillCode: string;
  geoStatus: GeoStatus;
  position: Position | null;
  onStartGps: () => void;
  onShowPoint: (lat: number, lng: number) => void;
  onToast: (msg: string) => void;
  onOpenApp: () => void;
  onPickSpot: () => void;
  onClose: () => void;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------- Kein Spiel: Erstellen oder Beitreten ----------

function StartView({ game, prefillCode }: { game: GameApi; prefillCode: string }) {
  const [name, setName] = useState(game.profile.name);
  const [gameName, setGameName] = useState('');
  const [code, setCode] = useState(prefillCode);
  const nameOk = name.trim().length >= 2;
  const commitName = () => nameOk && name.trim() !== game.profile.name && game.setName(name.trim());

  return (
    <>
      <div className="game-hero">
        <div className="game-hero-art" aria-hidden="true">
          <Blob size={70} color="white" hiding className="hero-hider" />
          <Blob size={76} color="ink" magnifier className="hero-seeker" />
        </div>
        <div>
          <h3>Versteck dich – oder such!</h3>
          <p>Die Hälfte versteckt sich irgendwo in der Schweiz, die anderen suchen mit Zug und Power-ups.</p>
        </div>
      </div>
      <label className="field">
        <span>Dein Name</span>
        <input value={name} maxLength={20} placeholder="z.B. Fabi" onChange={(e) => setName(e.target.value)} onBlur={commitName} />
      </label>
      <div className="game-cards">
        <section className="game-card">
          <h3>
            <UsersIcon size={18} /> Spiel beitreten
          </h3>
          <input
            className="code-input"
            value={code}
            autoCapitalize="characters"
            placeholder="CODE"
            aria-label="Spielcode"
            maxLength={CODE_LENGTH}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <button
            className="wide-btn"
            disabled={!nameOk || code.length !== CODE_LENGTH}
            onClick={() => {
              commitName();
              game.join(code);
            }}
          >
            Beitreten
          </button>
        </section>
        <section className="game-card">
          <h3>
            <FlagIcon size={18} /> Neues Spiel
          </h3>
          <input className="plain-input" value={gameName} maxLength={30} placeholder="Name, z.B. Ostschweiz-Runde" onChange={(e) => setGameName(e.target.value)} />
          <button
            className="wide-btn secondary"
            disabled={!nameOk}
            onClick={() => {
              commitName();
              game.create(gameName);
            }}
          >
            Spiel erstellen
          </button>
        </section>
      </div>
      {!nameOk && <p className="muted small route-note">Gib zuerst deinen Namen ein (mindestens 2 Zeichen).</p>}
      <p className="fine-print">
        Standorte und Fotos gehen nur an die Mitspieler und sind mit dem Spielcode verschlüsselt. Gesendet wird nur, solange die App
        offen ist.
      </p>
    </>
  );
}

// ---------- Lobby ----------

const OPTIONS: Record<keyof GameSettings, { values: number[]; fmt: (v: number) => string; label: string }> = {
  maxPlayers: { values: [2, 3, 4, 5, 6, 7, 8, 10, 12], fmt: (v) => `${v} Spieler`, label: 'Auslosung bei' },
  hideMin: { values: [1, 15, 30, 45, 60, 90, 120, 150, 180], fmt: (v) => (v === 1 ? '1 Min (Test)' : minLabel(v)), label: 'Versteckzeit' },
  seekMaxMin: { values: [30, 60, 90, 120, 180, 240, 300, 360], fmt: (v) => minLabel(v), label: 'Max. Suchzeit' },
  challengeEveryMin: { values: [1, 5, 10, 15, 20, 30], fmt: (v) => (v === 1 ? 'jede Minute (Test)' : `alle ${v} Min`), label: 'Challenges' },
  seekerPointsPerMin: { values: [1, 2, 3, 5], fmt: (v) => `${v} P pro Min`, label: 'Punkte Fänger' },
  seekerStartPoints: { values: [0, 20, 50, 100, 200], fmt: (v) => `${v} P`, label: 'Startguthaben Fänger' },
};

function minLabel(m: number) {
  if (m < 60) return `${m} Min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} Min` : `${m / 60} h`;
}

function SettingsView({ meta, editable, onChange }: { meta: GameMeta; editable: boolean; onChange: (p: Partial<GameSettings>) => void }) {
  return (
    <div className="settings">
      {(Object.keys(OPTIONS) as (keyof GameSettings)[]).map((key) => {
        const o = OPTIONS[key];
        const value = meta.settings[key];
        const values = o.values.includes(value) ? o.values : [...o.values, value].sort((a, b) => a - b);
        return (
          <label key={key} className="setting">
            <span>{o.label}</span>
            <select disabled={!editable} value={value} onChange={(e) => onChange({ [key]: Number(e.target.value) })}>
              {values.map((v) => (
                <option key={v} value={v}>
                  {o.fmt(v)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

/** Spielfeld: ganze Schweiz oder ausgewählte Kantone (Host wählt) */
function FieldView({ meta, editable, onChange }: { meta: GameMeta; editable: boolean; onChange: (abbrs: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const cantons = useCantonProps();
  const field = meta.field ?? [];
  const toggle = (abbr: string) => onChange(field.includes(abbr) ? field.filter((x) => x !== abbr) : [...field, abbr]);
  const toggleRegion = (list: string[]) => {
    const all = list.every((c) => field.includes(c));
    onChange(all ? field.filter((c) => !list.includes(c)) : [...new Set([...field, ...list])]);
  };
  return (
    <div className="field-box">
      <strong>🗺️ {field.length ? `${field.length} ${field.length === 1 ? 'Kanton' : 'Kantone'}: ${field.join(', ')}` : 'Ganze Schweiz'}</strong>
      <small>{field.length ? 'Verstecken ist nur hier erlaubt. Der Rest der Karte ist abgedunkelt.' : 'Versteckt euch irgendwo in der Schweiz.'}</small>
      {editable && (
        <>
          <button className="link small" onClick={() => setOpen(!open)}>
            {open ? 'Fertig' : 'Spielfeld ändern'}
          </button>
          {open && (
            <>
              <div className="field-chips">
                <button className={`chip ${field.length ? '' : 'active'}`} onClick={() => onChange([])}>
                  Ganze Schweiz
                </button>
                {REGIONS.map((r) => (
                  <button key={r.name} className={`chip ${r.cantons.every((c) => field.includes(c)) ? 'active' : ''}`} onClick={() => toggleRegion(r.cantons)}>
                    {r.name}
                  </button>
                ))}
              </div>
              <div className="field-chips cantons">
                {(cantons ?? [])
                  .slice()
                  .sort((a, b) => a.abbr.localeCompare(b.abbr))
                  .map((c) => (
                    <button key={c.abbr} className={`chip ${field.includes(c.abbr) ? 'active' : ''}`} title={c.name} onClick={() => toggle(c.abbr)}>
                      {c.abbr}
                    </button>
                  ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LobbyView({ game, snap, d, position, now, onToast }: { game: GameApi; snap: GameSnapshot; d: Derived; position: Position | null; now: number; onToast: Props['onToast'] }) {
  const c = game.client!;
  const meta = snap.meta!;
  const host = meta.hostId === snap.me.id;
  const players = Object.values(snap.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const online = players.filter((p) => p.id === snap.me.id || isOnline(p, now));
  const need = meta.settings.maxPlayers;
  const link = inviteLink(snap.code);

  const share = async () => {
    const text = `Komm zu Spurlos – Runde «${meta.name}»! Code: ${snap.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Spurlos', text, url: link });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    onToast((await copy(`${text}\n${link}`)) ? 'Einladung kopiert' : 'Kopieren nicht möglich');
  };

  return (
    <>
      <div className="code-box">
        <div>
          <small>Spielcode</small>
          <button className="code" onClick={async () => onToast((await copy(snap.code)) ? 'Code kopiert' : snap.code)} title="Code kopieren">
            {snap.code}
            <CopyIcon size={18} />
          </button>
        </div>
        <button className="wide-btn invite" onClick={share}>
          <ShareIcon size={18} /> Einladen
        </button>
      </div>

      <div className="lobby-progress">
        <div className="lobby-bar">
          <span style={{ width: `${Math.min(100, (online.length / need) * 100)}%` }} />
        </div>
        <strong>
          {online.length} / {need} Spieler
        </strong>
        <small>
          {meta.round > 1
            ? `Runde ${meta.round}: Der Host lost neu aus oder tauscht die Rollen.`
            : 'Ist die Lobby voll, lost die App die Teams aus: die Hälfte versteckt sich, die anderen suchen.'}
        </small>
      </div>

      <ul className="players">
        {players.map((p) => (
          <li key={p.id} className="player">
            <span className="player-main">
              <Avatar p={p} />
              <span className="player-text">
                <strong>
                  {p.name}
                  {p.id === snap.me.id && ' (du)'}
                </strong>
                <small>
                  {[
                    meta.hostId === p.id ? 'Host' : null,
                    p.id !== snap.me.id && p.pos && position ? formatDistance(distanceMeters(position, p.pos)) : null,
                    p.id !== snap.me.id && !isOnline(p, now) ? 'offline' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'bereit'}
                </small>
              </span>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="section-title">Regeln {host ? '' : '(legt der Host fest)'}</h3>
      <SettingsView meta={meta} editable={host} onChange={(p) => c.updateSettings(p)} />

      <h3 className="section-title">Spielfeld</h3>
      <FieldView meta={meta} editable={host} onChange={(abbrs) => c.updateField(abbrs)} />

      <ChatPanel client={c} snap={snap} d={d} team={null} title="Lobby-Chat" />

      {host ? (
        <div className="draw-actions">
          <button className="wide-btn start" disabled={online.length < 2} onClick={() => c.draw()}>
            🎡 {meta.round > 1 ? 'Neu auslosen' : 'Jetzt auslosen'}
          </button>
          {meta.round > 1 && meta.lastHiders && (
            <button className="wide-btn secondary" disabled={online.length < 2} onClick={() => c.draw(true)}>
              🔄 Rollen tauschen
            </button>
          )}
        </div>
      ) : (
        <p className="muted small route-note">{meta.round > 1 ? 'Warte, bis der Host die neue Runde auslost …' : 'Warte, bis die Lobby voll ist oder der Host auslost …'}</p>
      )}
    </>
  );
}

// ---------- Ergebnis ----------

function ResultView({ game, snap, d, onShowPoint }: { game: GameApi; snap: GameSnapshot; d: Derived; onShowPoint: Props['onShowPoint'] }) {
  const r = d.result;
  const host = snap.meta?.hostId === snap.me.id;
  const myTeam = d.teamOf(snap.me.id);
  const won = r?.winner === myTeam;
  const headline = !r || !r.winner ? 'Spiel beendet' : r.winner === 'seeker' ? '🔍 Die Fänger gewinnen!' : '🫣 Die Verstecker gewinnen!';
  const sub =
    r?.reason === 'found'
      ? `${snap.players[r.finder ?? '']?.name ?? 'Die Fänger'} hat das Versteck nach ${formatClock(r.hiddenMs)} Suche gefunden.`
      : r?.reason === 'time'
        ? `Unentdeckt während ${formatClock(r.hiddenMs)} – die Zeit ist abgelaufen.`
        : 'Der Host hat das Spiel beendet.';
  const powerups = d.actions.filter((a) => a.kind === 'powerup').length;
  const challenges = d.challenges.filter((c) => c.done).length;
  return (
    <>
      <div className={`result ${won ? 'won' : 'lost'}`}>
        <span className="result-emoji">{won ? '🏆' : r?.winner ? '😮‍💨' : '🏁'}</span>
        <strong>{headline}</strong>
        <small>{sub}</small>
      </div>
      <dl className="stats result-stats">
        <div>
          <dt>Versteckt</dt>
          <dd>{formatClock(r?.hiddenMs ?? 0)}</dd>
        </div>
        <div>
          <dt>Power-ups</dt>
          <dd>{powerups}</dd>
        </div>
        <div>
          <dt>Challenges</dt>
          <dd>
            {challenges}/{d.challenges.length}
          </dd>
        </div>
      </dl>
      {d.spot && (
        <div className="spot-card done">
          <div className="spot-head">
            <span>🏠</span>
            <div>
              <strong>Das Versteck</strong>
              <small>
                {[d.spot.facts.municipality, d.spot.facts.cantonName].filter(Boolean).join(', ') || 'eingeloggt'}
                {d.spot.facts.population ? ` · ${formatNumber(d.spot.facts.population)} Einwohner` : ''}
              </small>
            </div>
            <button className="chip" onClick={() => onShowPoint(d.spot!.fix.lat, d.spot!.fix.lng)}>
              Zeigen
            </button>
          </div>
        </div>
      )}
      <h3 className="section-title">Teams</h3>
      <ul className="players">
        {Object.values(snap.players).map((p) => (
          <li key={p.id} className="player">
            <span className="player-main">
              <Avatar p={p} team={d.teamOf(p.id)} />
              <span className="player-text">
                <strong>{p.name}</strong>
                <small>
                  {TEAM_ICON[d.teamOf(p.id)]} {TEAM_LABEL[d.teamOf(p.id)]}
                </small>
              </span>
            </span>
          </li>
        ))}
      </ul>
      {host ? (
        <button className="wide-btn start" onClick={() => game.client?.newRound()}>
          Neue Runde
        </button>
      ) : (
        <p className="muted small route-note">Der Host kann eine neue Runde starten.</p>
      )}
    </>
  );
}

// ---------- Sheet ----------

export function GameSheet({ game, d, now, prefillCode, geoStatus, position, onStartGps, onShowPoint, onToast, onOpenApp, onPickSpot, onClose }: Props) {
  const { installed, canPrompt, ios, install } = useInstallPrompt();
  const sound = useSyncExternalStore(subscribeSound, soundOn);
  const snap = game.snapshot;
  const meta = snap?.meta ?? null;
  const inGame = !!game.session;
  const stage = d?.stage;

  const title = meta ? meta.name : inGame ? 'Verbinde …' : 'Spurlos';
  const subtitle = meta
    ? `${{ lobby: 'Lobby', draw: 'Auslosung', versus: 'Gleich geht’s los', hiding: 'Versteckzeit', seeking: 'Suche läuft', ended: 'Beendet' }[stage ?? 'lobby']} · Code ${snap!.code}`
    : inGame
      ? `Spiel ${game.session!.code}`
      : 'Das grosse Versteckspiel mit Freunden';

  return (
    <BottomSheet
      title={title}
      subtitle={subtitle}
      label="Spiel"
      onClose={onClose}
      scrollKey={stage}
      headerAction={
        <button className="icon-btn subtle sound-btn" aria-label={sound ? 'Töne ausschalten' : 'Töne einschalten'} title={sound ? 'Töne aus' : 'Töne an'} onClick={() => setSoundOn(!sound)}>
          {sound ? '🔊' : '🔇'}
        </button>
      }
    >
      {inGame && geoStatus !== 'active' && (
        <div className="gps-warning">
          <span>
            {geoStatus === 'denied'
              ? 'Standort ist blockiert. Erlaube ihn in den Browser-Einstellungen, sonst funktionieren Versteck und Power-ups nicht.'
              : 'Für das Spiel braucht es deinen Standort.'}
          </span>
          {geoStatus !== 'denied' && (
            <button className="chip" onClick={onStartGps}>
              <LocateIcon size={16} /> Freigeben
            </button>
          )}
        </div>
      )}

      {!inGame && <StartView game={game} prefillCode={prefillCode} />}

      {inGame && !meta && (
        <div className="connecting">
          {snap?.notFound ? (
            <>
              <p>
                Kein Spiel mit dem Code <strong>{game.session!.code}</strong> gefunden.
              </p>
              <button className="wide-btn secondary" onClick={game.forget}>
                Anderen Code eingeben
              </button>
            </>
          ) : !game.profile.name ? (
            <>
              <p>Gib zuerst deinen Namen ein.</p>
              <button className="wide-btn secondary" onClick={game.forget}>
                Zurück
              </button>
            </>
          ) : (
            <>
              <span className="spinner big" />
              <p>{snap?.conn === 'offline' ? 'Keine Verbindung – versuche es weiter …' : 'Verbinde mit dem Spiel …'}</p>
              <button className="link inline" onClick={game.forget}>
                Abbrechen
              </button>
            </>
          )}
        </div>
      )}

      {snap && meta && game.client && d && (
        <>
          {snap.conn !== 'online' && <div className="banner inline-banner">Verbindung unterbrochen – wird neu aufgebaut …</div>}
          {stage === 'lobby' && d && <LobbyView game={game} snap={snap} d={d} position={position} now={now} onToast={onToast} />}
          {(stage === 'draw' || stage === 'versus') && <p className="muted route-note">Die Auslosung läuft …</p>}
          {(stage === 'hiding' || stage === 'seeking') &&
            (d.teamOf(snap.me.id) === 'seeker' ? (
              <SeekerView client={game.client} snap={snap} d={d} now={now} position={position} onShowPoint={onShowPoint} onToast={onToast} onPickSpot={onPickSpot} />
            ) : (
              <HiderView client={game.client} snap={snap} d={d} now={now} position={position} onShowPoint={onShowPoint} onToast={onToast} onPickSpot={onPickSpot} />
            ))}
          {stage === 'ended' && <ResultView game={game} snap={snap} d={d} onShowPoint={onShowPoint} />}
          {meta.hostId === snap.me.id && (stage === 'hiding' || stage === 'seeking') && (
            <button className="link inline leave" onClick={() => window.confirm('Spiel für alle beenden?') && game.client?.end('host')}>
              Spiel für alle beenden
            </button>
          )}
          <button className="link inline leave" onClick={() => window.confirm('Spiel verlassen?') && void game.leave()}>
            Spiel verlassen
          </button>
        </>
      )}

      {!inGame && (
        <>
          <h3 className="section-title">So funktioniert’s</h3>
          <ol className="how-to">
            <li>Erstellt ein Spiel und ladet eure Freunde per Link ein. Ist die Lobby voll, lost das Glücksrad die Teams aus.</li>
            <li>Die Verstecker haben die Versteckzeit, um ihr Versteck irgendwo in der Schweiz einzuloggen. Die Fänger warten und sammeln Punkte.</li>
            <li>Danach kaufen die Fänger Power-ups wie «Karte halbieren» oder «Radar». Die App beantwortet sie automatisch und graut ausgeschlossene Gebiete aus.</li>
            <li>Die Verstecker müssen regelmässig Challenges lösen. Mit den Punkten stellen sie Fallen. Wer das Versteck findet, tippt auf «Gefunden!».</li>
          </ol>
          <h3 className="section-title">Vorbereitung</h3>
          <ul className="check-list">
            <li>
              <span className={`status-dot ${geoStatus === 'active' ? 'ok' : geoStatus === 'denied' || geoStatus === 'unavailable' ? 'bad' : ''}`} />
              <span className="check-text">
                <strong>GPS-Check</strong>
                <small>
                  {geoStatus === 'active'
                    ? position
                      ? `Bereit · Genauigkeit ±${Math.round(position.accuracy)} m`
                      : 'Bereit'
                    : geoStatus === 'searching'
                      ? 'Suche GPS-Signal …'
                      : geoStatus === 'denied'
                        ? 'Zugriff verweigert – in den Browser-Einstellungen erlauben'
                        : 'Noch nicht getestet'}
                </small>
              </span>
              {geoStatus !== 'active' && (
                <button className="chip" onClick={onStartGps}>
                  <LocateIcon size={16} /> Testen
                </button>
              )}
            </li>
            <li>
              <span className={`status-dot ${installed ? 'ok' : ''}`} />
              <span className="check-text">
                <strong>Als App installieren</strong>
                <small>
                  {installed
                    ? 'Läuft als App'
                    : ios
                      ? 'In Safari: Teilen-Symbol → «Zum Home-Bildschirm»'
                      : canPrompt
                        ? 'Mit einem Klick auf Handy oder PC installieren'
                        : 'Im Browser-Menü «App installieren» wählen'}
                </small>
              </span>
              {!installed && (
                <button className="chip" onClick={canPrompt ? () => void install() : onOpenApp}>
                  <DownloadIcon size={16} /> {canPrompt ? 'Installieren' : 'Anleitung'}
                </button>
              )}
            </li>
          </ul>
        </>
      )}
    </BottomSheet>
  );
}
