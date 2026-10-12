import { useEffect, useState, useSyncExternalStore } from 'react';
import { BottomSheet } from './BottomSheet';
import { GeistiSays } from './Geisti';
import { BADGES, levelOf, useStats, xpOf } from '../lib/stats';
import { setSoundOn, soundOn, subscribeSound } from '../lib/sound';
import { factOfDay } from '../game/content';
import { loadCantons, type CantonProps } from '../lib/cantons';
import type { GhostMood } from './Art';

interface Props {
  name: string;
  onName: (name: string) => void;
  onClose: () => void;
  onTour: () => void;
  onIntro: () => void;
  onOpenApp: () => void;
}

/** Profil: Level, Statistik, Abzeichen, besuchte Kantone und Einstellungen */
export function ProfileSheet({ name, onName, onClose, onTour, onIntro, onOpenApp }: Props) {
  const s = useStats();
  const xp = xpOf(s);
  const lvl = levelOf(xp);
  const sound = useSyncExternalStore(subscribeSound, soundOn);
  const [draft, setDraft] = useState(name);
  const [cantons, setCantons] = useState<CantonProps[]>([]);
  useEffect(() => {
    void loadCantons()
      .then((c) => setCantons(c.features.map((f) => f.properties).sort((a, b) => a.id - b.id)))
      .catch(() => undefined);
  }, []);

  const day = new Date().toISOString().slice(0, 10);
  const fact = factOfDay(day);
  const unlocked = BADGES.filter((b) => s.badges[b.id]).length;
  const first = name.split(/\s+/)[0] || 'du';
  const mood: GhostMood = s.wins > 0 ? 'cool' : s.rounds > 0 ? 'happy' : 'wink';
  const greeting =
    s.rounds === 0
      ? `Hoi ${first}! Noch keine Runde gespielt? Im Spiel-Tab lädst du deine Freunde ein – ich freu mich drauf!`
      : `Hoi ${first}! ${s.rounds} ${s.rounds === 1 ? 'Runde' : 'Runden'}, ${s.wins} ${s.wins === 1 ? 'Sieg' : 'Siege'}. Nicht schlecht für einen Menschen!`;

  const statRows: [string, number][] = [
    ['Runden', s.rounds],
    ['Siege', s.wins],
    ['als Fänger', s.winsSeeker],
    ['als Verstecker', s.winsHider],
    ['Power-ups', s.powerups],
    ['Fallen', s.traps],
    ['Challenges', s.challenges],
    ['Kantone', s.cantons.length],
  ];

  return (
    <BottomSheet title="Dein Profil" subtitle={`Level ${lvl.n} · ${lvl.name}`} label="Profil" onClose={onClose}>
      <div className="profile-hero">
        <GeistiSays text={greeting} mood={mood} size={96} side="right" />
      </div>

      <div className="level-card">
        <div className="level-badge">{lvl.n}</div>
        <div className="level-info">
          <strong>{lvl.name}</strong>
          <div className="level-bar">
            <span style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
          </div>
          <small>
            {xp} XP · noch {lvl.next - xp} XP bis Level {lvl.n + 1}
          </small>
        </div>
      </div>

      <div className="fact-card">
        <span className="fact-icon">{fact.icon}</span>
        <div>
          <small>Geistis Fakt des Tages</small>
          <strong>{fact.text}</strong>
        </div>
      </div>

      <h3 className="section-title">Statistik</h3>
      <div className="stat-grid">
        {statRows.map(([label, v]) => (
          <div key={label} className="stat">
            <strong>{v}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>

      <h3 className="section-title">
        Abzeichen · {unlocked} von {BADGES.length}
      </h3>
      <ul className="badge-grid">
        {BADGES.map((b) => {
          const [cur, goal] = b.progress(s);
          const got = !!s.badges[b.id];
          return (
            <li key={b.id} className={`badge-item ${got ? 'got' : ''}`} title={b.text}>
              <span className="badge-icon">{got ? b.icon : '🔒'}</span>
              <strong>{b.name}</strong>
              <small>{b.text}</small>
              {!got && goal > 1 && (
                <span className="badge-progress">
                  <span style={{ width: `${(cur / goal) * 100}%` }} />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h3 className="section-title">Kantone · {s.cantons.length} von 26</h3>
      <p className="fine-print">Jeder Kanton, in dem dein Standort an war, kommt in die Sammlung.</p>
      <ul className="canton-collect">
        {cantons.map((c) => (
          <li key={c.abbr} className={s.cantons.includes(c.abbr) ? 'got' : ''} title={c.name}>
            {c.abbr}
          </li>
        ))}
      </ul>

      <h3 className="section-title">Einstellungen</h3>
      <form
        className="profile-name"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim().length >= 2) onName(draft.trim());
        }}
      >
        <label className="field">
          <span>Dein Name</span>
          <input value={draft} maxLength={20} placeholder="z.B. Fabi" onChange={(e) => setDraft(e.target.value)} onBlur={() => draft.trim().length >= 2 && onName(draft.trim())} />
        </label>
      </form>
      <div className="profile-actions">
        <button className="chip" onClick={() => setSoundOn(!sound)}>
          {sound ? '🔊 Töne an' : '🔇 Töne aus'}
        </button>
        <button className="chip" onClick={onTour}>
          🧭 Tour mit Geisti
        </button>
        <button className="chip" onClick={onIntro}>
          👻 Einführung nochmals
        </button>
        <button className="chip" onClick={onOpenApp}>
          📲 App herunterladen
        </button>
      </div>
      <p className="fine-print">Fortschritt und Abzeichen bleiben nur auf diesem Gerät gespeichert.</p>
    </BottomSheet>
  );
}
