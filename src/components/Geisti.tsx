import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ghost, type GhostMood } from './Art';
import { bump, onBadge, useTipSeen, type Badge } from '../lib/stats';
import { buzz, play } from '../lib/sound';

/** Text Buchstabe für Buchstabe zeigen, wie gesprochen. Antippen zeigt alles. */
export function useTypewriter(text: string, speed = 24) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(text.length);
      return;
    }
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(id);
          return v;
        }
        return v + 1;
      });
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return { shown: text.slice(0, n), done: n >= text.length, finish: () => setN(text.length) };
}

const POKES = [
  'Hihi, das kitzelt! 👻',
  'Buh!',
  'Ich bin nicht durchsichtig, nur schüchtern.',
  'Geister fahren übrigens gratis ÖV.',
  'Noch einmal und ich verschwinde!',
  'Huch!',
  'Ich spuke seit 1291 durch die Schweiz.',
  'Psst, ich kenne jedes Versteck …',
];
const POKE_MOODS: GhostMood[] = ['surprised', 'cheer', 'wink', 'love'];

/** Antippen: Geisti reagiert mit einem Spruch, einem Ton und einer anderen Miene */
function PokeableGhost(props: Omit<Parameters<typeof Ghost>[0], 'className'>) {
  const [n, setN] = useState(0);
  const [active, setActive] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const poke = () => {
    play('boo');
    buzz(25);
    bump('pokes');
    setN((v) => v + 1);
    setActive(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActive(false), 2200);
  };
  return (
    <button type="button" className="ghost-btn" onClick={poke} aria-label="Geisti antippen">
      {active && (
        <span className="ghost-poke" key={n}>
          {POKES[(n - 1) % POKES.length]}
        </span>
      )}
      <Ghost {...props} mood={active ? POKE_MOODS[(n - 1) % POKE_MOODS.length] : props.mood} talking={active ? false : props.talking} />
    </button>
  );
}

/** Geisti mit Sprechblase */
export function GeistiSays({
  text,
  mood = 'happy',
  size = 120,
  wave,
  party,
  magnifier,
  side = 'top',
  className = '',
  onTypedChange,
}: {
  text: string;
  mood?: GhostMood;
  size?: number;
  wave?: boolean;
  party?: boolean;
  magnifier?: boolean;
  side?: 'top' | 'right';
  className?: string;
  onTypedChange?: (done: boolean) => void;
}) {
  const { shown, done, finish } = useTypewriter(text);
  useEffect(() => onTypedChange?.(done), [done, onTypedChange]);
  return (
    <div className={`geisti-says ${side} ${className}`}>
      <button type="button" className="speech" onClick={finish} aria-live="polite">
        {/* Unsichtbarer Volltext hält die Grösse fest, damit nichts springt */}
        <span className="speech-full" aria-hidden="true">
          {text}
        </span>
        <span className="speech-typed">{shown}</span>
      </button>
      <PokeableGhost size={size} mood={mood} talking={!done && mood !== 'sleep'} wave={wave} party={party} magnifier={magnifier} />
    </div>
  );
}

/** Einmaliger Tipp von Geisti; verschwindet nach «Verstanden» für immer */
export function GeistiTip({ id, mood = 'happy', magnifier, children }: { id: string; mood?: GhostMood; magnifier?: boolean; children: ReactNode }) {
  const [seen, dismiss] = useTipSeen(id);
  if (seen) return null;
  return (
    <div className="geisti-tip" role="note">
      <Ghost size={58} mood={mood} magnifier={magnifier} shadow={false} />
      <div className="geisti-tip-body">
        <strong>Geisti sagt</strong>
        <p>{children}</p>
        <button className="chip" onClick={dismiss}>
          Verstanden
        </button>
      </div>
    </div>
  );
}

/** Feiert neue Abzeichen mit Partyhut, Ton und Vibration */
export function BadgePopup({ onOpen }: { onOpen: () => void }) {
  const [queue, setQueue] = useState<Badge[]>([]);
  const current = queue[0];
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => onBadge((b) => setQueue((q) => [...q, b])), []);
  useEffect(() => {
    if (!current) return;
    play('win');
    buzz([80, 40, 80, 40, 160]);
    timer.current = window.setTimeout(() => setQueue((q) => q.slice(1)), 4800);
    return () => window.clearTimeout(timer.current);
  }, [current]);
  if (!current) return null;
  return (
    <button
      key={current.id}
      className="badge-popup"
      onClick={() => {
        setQueue((q) => q.slice(1));
        onOpen();
      }}
    >
      <Ghost size={64} mood="cheer" party shadow={false} />
      <span className="badge-popup-text">
        <small>Neues Abzeichen!</small>
        <strong>
          {current.icon} {current.name}
        </strong>
        <span>{current.text}</span>
      </span>
    </button>
  );
}
