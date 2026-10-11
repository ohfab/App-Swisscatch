import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { CheckIcon, CopyIcon, DownloadIcon, FlagIcon, LocateIcon, ShareIcon, UsersIcon } from './Icons';
import type { GeoStatus, Position } from '../hooks/useGeolocation';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useNow } from '../hooks/useNow';
import { useWakeLock, wakeLockSupported } from '../hooks/useWakeLock';
import { usePersistentState } from '../hooks/usePersistentState';
import { inviteLink, type GameApi } from '../game/useGame';
import { formatAgo, formatClock, gameEnd, huntStart, isOnline, nextPingAt, teamOf, visibleFix } from '../game/rules';
import type { GameMeta, GameSettings, PlayerState, Team } from '../game/types';
import type { GameSnapshot } from '../game/client';
import { distanceMeters, formatDistance } from '../lib/geo';
import { normalizeCode, CODE_LENGTH } from '../game/crypto';

interface Props {
  game: GameApi;
  geoStatus: GeoStatus;
  position: Position | null;
  onStartGps: () => void;
  onShowPlayer: (lat: number, lng: number) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

export const TEAM_LABEL: Record<Team, string> = { hunter: 'Jäger', runner: 'Gejagt' };

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Avatar({ p, team, size = 34 }: { p: Pick<PlayerState, 'name' | 'color'>; team?: Team; size?: number }) {
  return (
    <span
      className={`avatar ${team ?? ''}`}
      style={{ background: p.color, width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {(p.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
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
            inputMode="text"
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
          <input className="plain-input" value={gameName} maxLength={30} placeholder="Name, z.B. Fangis Ostschweiz" onChange={(e) => setGameName(e.target.value)} />
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
        Dein Standort geht nur an die Mitspieler und ist mit dem Spielcode verschlüsselt. Er wird nur gesendet, solange
        die App offen ist.
      </p>
    </>
  );
}

// ---------- Einstellungen ----------

const OPTIONS = {
  durationMin: [30, 60, 90, 120, 180, 240, 360, 480],
  pingIntervalMin: [1, 5, 10, 15, 20, 30, 45, 60],
  headStartMin: [0, 5, 10, 15, 20, 30, 45, 60],
};

const minLabel = (m: number) => (m === 0 ? 'keiner' : m < 60 ? `${m} Min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} Min` : `${m / 60} h`);

function SettingsView({ meta, editable, onChange }: { meta: GameMeta; editable: boolean; onChange: (p: Partial<GameSettings>) => void }) {
  const s = meta.settings;
  const select = (key: keyof typeof OPTIONS, label: string, fmt = minLabel) => (
    <label className="setting">
      <span>{label}</span>
      <select disabled={!editable} value={s[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })}>
        {OPTIONS[key].map((v) => (
          <option key={v} value={v}>
            {fmt(v)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="settings">
      {select('durationMin', 'Spieldauer')}
      {select('headStartMin', 'Vorsprung der Gejagten')}
      {select('pingIntervalMin', 'Standort der Gejagten', (v) => `alle ${minLabel(v)}`)}
      <label className="setting">
        <span>Jäger sichtbar für Gejagte</span>
        <select
          disabled={!editable}
          value={s.hunterVisibility}
          onChange={(e) => onChange({ hunterVisibility: e.target.value as GameSettings['hunterVisibility'] })}
        >
          <option value="live">immer (live)</option>
          <option value="ping">nur beim Ping</option>
          <option value="hidden">nie</option>
        </select>
      </label>
      <label className="setting">
        <span>Gefangene werden Jäger</span>
        <select disabled={!editable} value={s.caughtBecomeHunters ? '1' : '0'} onChange={(e) => onChange({ caughtBecomeHunters: e.target.value === '1' })}>
          <option value="0">nein</option>
          <option value="1">ja</option>
        </select>
      </label>
    </div>
  );
}

// ---------- Spielerliste ----------

function PlayerRow({
  p,
  snap,
  position,
  now,
  onTeam,
  onShow,
  action,
}: {
  p: PlayerState;
  snap: GameSnapshot;
  position: Position | null;
  now: number;
  onTeam?: () => void;
  onShow?: (lat: number, lng: number) => void;
  action?: React.ReactNode;
}) {
  const meta = snap.meta!;
  const team = teamOf(meta, p.id);
  const me = p.id === snap.me.id;
  const viewerTeam = teamOf(meta, snap.me.id);
  const vis = me ? null : visibleFix(meta, viewerTeam, p);
  const parts: string[] = [];
  if (meta.hostId === p.id) parts.push('Host');
  if (p.caughtAt) parts.push(`gefangen ${formatAgo(now - p.caughtAt)}`);
  else if (vis) {
    if (vis.kind === 'ping') parts.push(`Ping ${formatAgo(now - vis.fix.t)}`);
    if (position) parts.push(formatDistance(distanceMeters(position, vis.fix)));
  } else if (me && meta.phase === 'running') {
    if (team === 'hunter') parts.push('du sendest live');
    else parts.push(p.ping ? `dein Ping ${formatAgo(now - p.ping.t)}` : 'noch kein Ping gesendet');
  } else if (!me && meta.phase === 'running' && team === 'runner') parts.push('noch kein Ping');
  if (!me && !isOnline(p, now)) parts.push('offline');
  return (
    <li className={`player ${p.caughtAt ? 'caught' : ''}`}>
      <button className="player-main" onClick={vis && onShow ? () => onShow(vis.fix.lat, vis.fix.lng) : undefined} disabled={!vis}>
        <Avatar p={p} team={team} />
        <span className="player-text">
          <strong>
            {p.name}
            {me && ' (du)'}
          </strong>
          {parts.length > 0 && <small>{parts.join(' · ')}</small>}
        </span>
      </button>
      {onTeam ? (
        <button className={`team-chip ${team}`} onClick={onTeam} aria-label={`Team von ${p.name} wechseln`}>
          {TEAM_LABEL[team]}
        </button>
      ) : (
        <span className={`team-chip ${team} static`}>{TEAM_LABEL[team]}</span>
      )}
      {action}
    </li>
  );
}

// ---------- Lobby ----------

function LobbyView({ game, snap, position, now, onShowPlayer, onToast }: { game: GameApi; snap: GameSnapshot; position: Position | null; now: number; onShowPlayer: Props['onShowPlayer']; onToast: Props['onToast'] }) {
  const c = game.client!;
  const meta = snap.meta!;
  const host = meta.hostId === snap.me.id;
  const players = Object.values(snap.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const hunters = players.filter((p) => teamOf(meta, p.id) === 'hunter').length;
  const runners = players.length - hunters;
  const link = inviteLink(snap.code);

  const share = async () => {
    const text = `Komm ins SwissCatch-Spiel «${meta.name}»! Code: ${snap.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'SwissCatch', text, url: link });
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
          <ShareIcon size={18} /> Freunde einladen
        </button>
      </div>

      <h3 className="section-title">
        Spieler ({players.length}) · {hunters} Jäger, {runners} Gejagte
      </h3>
      <ul className="players">
        {players.map((p) => (
          <PlayerRow
            key={p.id}
            p={p}
            snap={snap}
            position={position}
            now={now}
            onShow={onShowPlayer}
            onTeam={
              host || p.id === snap.me.id
                ? () => {
                    const next: Team = teamOf(meta, p.id) === 'hunter' ? 'runner' : 'hunter';
                    if (host) c.setTeam(p.id, next);
                    else c.requestTeam(next);
                  }
                : undefined
            }
          />
        ))}
      </ul>
      <p className="muted small route-note">Tippe auf «Jäger» oder «Gejagt», um das Team zu wechseln.</p>

      <h3 className="section-title">Regeln {host ? '' : '(legt der Host fest)'}</h3>
      <SettingsView meta={meta} editable={host} onChange={(p) => c.updateSettings(p)} />

      {host ? (
        <button className="wide-btn start" disabled={hunters === 0 || runners === 0} onClick={() => c.start()}>
          Spiel starten
        </button>
      ) : (
        <p className="muted small route-note">Warte, bis der Host das Spiel startet …</p>
      )}
      {host && (hunters === 0 || runners === 0) && <p className="muted small route-note">Es braucht mindestens einen Jäger und einen Gejagten.</p>}
    </>
  );
}

// ---------- Laufendes Spiel ----------

function RunningView({ game, snap, position, now, onShowPlayer }: { game: GameApi; snap: GameSnapshot; position: Position | null; now: number; onShowPlayer: Props['onShowPlayer'] }) {
  const c = game.client!;
  const meta = snap.meta!;
  const myTeam = teamOf(meta, snap.me.id);
  const me = snap.players[snap.me.id];
  const host = meta.hostId === snap.me.id;
  const [awake, setAwake] = usePersistentState('game.wakelock', true);
  useWakeLock(awake);
  const start = huntStart(meta);
  const end = gameEnd(meta);
  const next = nextPingAt(meta, now);
  const players = Object.values(snap.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const byTeam = (t: Team) => players.filter((p) => teamOf(meta, p.id) === t);

  return (
    <>
      <div className={`status-card ${myTeam}`}>
        <div className="status-role">
          <small>Deine Rolle</small>
          <strong>{me?.caughtAt ? 'Gefangen' : TEAM_LABEL[myTeam]}</strong>
        </div>
        <div className="status-times">
          {now < start ? (
            <div>
              <small>{myTeam === 'hunter' ? 'Warten noch' : 'Vorsprung'}</small>
              <strong>{formatClock(start - now)}</strong>
            </div>
          ) : (
            <div>
              <small>Restzeit</small>
              <strong>{formatClock(end - now)}</strong>
            </div>
          )}
          {next && (
            <div>
              <small>Nächster Ping</small>
              <strong>{formatClock(next - now)}</strong>
            </div>
          )}
        </div>
      </div>
      {myTeam === 'hunter' && now < start && <p className="muted small route-note">Fair bleiben: Losrennen erst nach Ablauf des Vorsprungs.</p>}
      {myTeam === 'runner' && !me?.caughtAt && (
        <p className="muted small route-note">
          Beim Ping sehen die Jäger deinen Standort. Lass die App offen, sonst wird der Ping nachgeholt, sobald du sie
          wieder öffnest.
        </p>
      )}

      {(['runner', 'hunter'] as const).map((t) => (
        <div key={t}>
          <h3 className="section-title">
            {t === 'runner' ? 'Gejagte' : 'Jäger'} ({byTeam(t).length})
          </h3>
          <ul className="players">
            {byTeam(t).map((p) => (
              <PlayerRow
                key={p.id}
                p={p}
                snap={snap}
                position={position}
                now={now}
                onShow={onShowPlayer}
                action={
                  myTeam === 'hunter' && t === 'runner' && !p.caughtAt && !me?.caughtAt ? (
                    <button className="chip catch" onClick={() => c.claimCatch(p.id)}>
                      Gefangen!
                    </button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </div>
      ))}

      {myTeam === 'runner' && !me?.caughtAt && (
        <button
          className="wide-btn danger-btn"
          onClick={() => window.confirm('Wurdest du wirklich gefangen?') && c.reportCaught()}
        >
          Ich wurde gefangen
        </button>
      )}
      {wakeLockSupported() && (
        <label className="toggle-row plain">
          <span>
            <strong>Bildschirm anlassen</strong>
            <small>Hält Standort und Pings am Laufen</small>
          </span>
          <input type="checkbox" role="switch" checked={awake} onChange={() => setAwake(!awake)} />
          <span className="switch" aria-hidden="true" />
        </label>
      )}
      {host && (
        <button className="wide-btn secondary" onClick={() => window.confirm('Spiel für alle beenden?') && c.end('host')}>
          Spiel beenden
        </button>
      )}
    </>
  );
}

// ---------- Spielende ----------

function EndedView({ game, snap, now }: { game: GameApi; snap: GameSnapshot; now: number }) {
  const meta = snap.meta!;
  const host = meta.hostId === snap.me.id;
  const players = Object.values(snap.players);
  const runners = players.filter((p) => teamOf(meta, p.id) === 'runner' || p.caughtAt);
  const start = huntStart(meta);
  const headline =
    meta.endReason === 'all-caught'
      ? 'Alle gefangen – die Jäger gewinnen!'
      : meta.endReason === 'time'
        ? 'Zeit um – die Gejagten gewinnen!'
        : 'Spiel beendet';
  return (
    <>
      <div className="result">
        <span className="result-icon">
          <CheckIcon size={26} />
        </span>
        <strong>{headline}</strong>
        <small>Gespielt: {formatClock((meta.endedAt ?? now) - (meta.startedAt ?? now))}</small>
      </div>
      <h3 className="section-title">Gejagte</h3>
      <ul className="players">
        {runners
          .sort((a, b) => (b.caughtAt ?? Infinity) - (a.caughtAt ?? Infinity))
          .map((p) => (
            <li key={p.id} className="player">
              <span className="player-main">
                <Avatar p={p} team="runner" />
                <span className="player-text">
                  <strong>{p.name}</strong>
                  <small>{p.caughtAt ? `gefangen nach ${formatClock(p.caughtAt - start)}` : 'nicht gefangen 🎉'}</small>
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

export function GameSheet({ game, geoStatus, position, onStartGps, onShowPlayer, onToast, onClose, prefillCode }: Props & { prefillCode: string }) {
  const { installed, canPrompt, ios, install } = useInstallPrompt();
  const snap = game.snapshot;
  const meta = snap?.meta ?? null;
  const now = useNow(1000, !!meta);
  const inGame = !!game.session;

  const title = meta ? meta.name : inGame ? 'Verbinde …' : 'Das grosse Fangen';
  const subtitle = meta
    ? meta.phase === 'lobby'
      ? `Lobby · Code ${snap!.code}`
      : meta.phase === 'running'
        ? `Läuft · Code ${snap!.code}`
        : `Beendet · Code ${snap!.code}`
    : inGame
      ? `Spiel ${game.session!.code}`
      : 'Schweizweit mit Freunden';

  return (
    <BottomSheet title={title} subtitle={subtitle} label="Spiel" onClose={onClose}>
      {inGame && geoStatus !== 'active' && (
        <div className="gps-warning">
          <span>
            {geoStatus === 'denied'
              ? 'Standort ist blockiert. Erlaube ihn in den Einstellungen des Browsers, sonst sehen dich die anderen nicht.'
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

      {snap && meta && game.client && (
        <>
          {snap.conn !== 'online' && <div className="banner inline-banner">Verbindung unterbrochen – wird neu aufgebaut …</div>}
          {meta.phase === 'lobby' && <LobbyView game={game} snap={snap} position={position} now={now} onShowPlayer={onShowPlayer} onToast={onToast} />}
          {meta.phase === 'running' && <RunningView game={game} snap={snap} position={position} now={now} onShowPlayer={onShowPlayer} />}
          {meta.phase === 'ended' && <EndedView game={game} snap={snap} now={now} />}
          <button
            className="link inline leave"
            onClick={() => window.confirm('Spiel verlassen?') && void game.leave()}
          >
            Spiel verlassen
          </button>
        </>
      )}

      {!inGame && (
        <>
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
                        ? 'Mit einem Tipp auf den Home-Bildschirm'
                        : 'Im Browser-Menü «App installieren» wählen'}
                </small>
              </span>
              {!installed && canPrompt && (
                <button className="chip" onClick={install}>
                  <DownloadIcon size={16} /> Installieren
                </button>
              )}
            </li>
          </ul>
          <h3 className="section-title">So funktioniert’s</h3>
          <ol className="how-to">
            <li>Eine Person erstellt das Spiel und lädt die anderen per Link oder Code ein.</li>
            <li>In der Lobby teilt ihr euch in Jäger und Gejagte auf und legt die Regeln fest.</li>
            <li>Nach dem Start bekommen die Gejagten Vorsprung. Danach sehen die Jäger deren Standort bei jedem Ping.</li>
            <li>Wer gefangen wird, tippt auf «Ich wurde gefangen» oder bestätigt den Fang des Jägers.</li>
          </ol>
        </>
      )}
    </BottomSheet>
  );
}
