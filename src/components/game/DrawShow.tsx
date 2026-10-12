import { useEffect, useMemo, useState } from 'react';
import { drawDuration, drawStepTimes } from '../../game/derive';
import { rng } from '../../game/content';
import type { GameMeta, PlayerState } from '../../game/types';
import { useNow } from '../../hooks/useNow';
import { Avatar } from './common';
import { Blob, Drips } from '../Art';
import { buzz, play } from '../../lib/sound';

const SPIN_MS = 2600;
const SIZE = 300;
const R = SIZE / 2;
const SEG_R = R - 9;
/** Segmentfarben im Markenstil; auf dunklen Segmenten weisse Schrift */
const SEG_COLORS = ['#f9b07e', '#ffffff', '#f2914f', '#3a3560'];

function segColor(i: number, n: number) {
  // Das letzte Segment darf nicht dieselbe Farbe wie das erste haben
  const idx = i === n - 1 && n > 1 && i % SEG_COLORS.length === 0 ? 2 : i % SEG_COLORS.length;
  return { fill: SEG_COLORS[idx]!, dark: idx === 3 };
}

interface Props {
  meta: GameMeta;
  players: Record<string, PlayerState>;
  meId: string;
  /** Versatz zur Spieluhr, damit das Rad auf allen Geräten gleichzeitig dreht */
  clockOffset: number;
  onSkip: () => void;
}

function polar(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [R + r * Math.cos(a), R + r * Math.sin(a)] as const;
}

function segmentPath(i: number, n: number) {
  if (n === 1) return `M ${R} ${R} m -${SEG_R} 0 a ${SEG_R} ${SEG_R} 0 1 0 ${SEG_R * 2} 0 a ${SEG_R} ${SEG_R} 0 1 0 -${SEG_R * 2} 0`;
  const a0 = (360 / n) * i;
  const a1 = (360 / n) * (i + 1);
  const [x0, y0] = polar(a0, SEG_R);
  const [x1, y1] = polar(a1, SEG_R);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${R} ${R} L ${x0} ${y0} A ${SEG_R} ${SEG_R} 0 ${large} 1 ${x1} ${y1} Z`;
}

function Wheel({ ids, players, target, seed, step, sinceStepStart, highlight, idle }: { ids: string[]; players: Props['players']; target: string; seed: string; step: number; sinceStepStart: number; highlight: boolean; idle: boolean }) {
  const n = ids.length;
  const seg = 360 / n;
  const idx = ids.indexOf(target);
  const jitter = (rng(`${seed}:wheel:${step}`)() - 0.5) * seg * 0.6;
  const finalRot = 360 * 6 - (idx * seg + seg / 2) + jitter;
  const remaining = idle ? 0 : Math.max(0, SPIN_MS - sinceStepStart);
  const [rot, setRot] = useState(idle ? 0 : remaining > 0 ? 0 : finalRot);
  useEffect(() => {
    if (idle || remaining <= 0) return;
    // Erst im nächsten Frame drehen, damit der Übergang greift
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setRot(finalRot)));
    // Klackern, das wie das Rad langsamer wird
    const timers: number[] = [];
    for (let t = 0, gap = 45; t < remaining - 150; t += gap, gap *= 1.085) timers.push(window.setTimeout(() => play('tick'), t));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((x) => window.clearTimeout(x));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wheel-wrap">
      <svg className="wheel-pointer" viewBox="0 0 40 50" aria-hidden="true">
        <path d="M20 47 C9 31 4 25 4 18 A16 16 0 0 1 36 18 C36 25 31 31 20 47 Z" />
      </svg>
      <svg
        className="wheel"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ transform: `rotate(${rot}deg)`, transitionDuration: `${remaining}ms` }}
        aria-hidden="true"
      >
        <circle cx={R} cy={R} r={R - 1.5} fill="#fff" stroke="#1f1c35" strokeWidth="3" />
        {ids.map((id, i) => {
          const p = players[id];
          const mid = i * seg + seg / 2;
          const [tx, ty] = polar(mid, SEG_R * 0.64);
          const name = (p?.name ?? '?').slice(0, 10);
          const c = segColor(i, n);
          return (
            <g key={id} className={highlight && id === target ? 'seg-win' : ''}>
              <path d={segmentPath(i, n)} fill={c.fill} stroke="#1f1c35" strokeWidth="3" strokeLinejoin="round" />
              <text x={tx} y={ty} transform={`rotate(${mid} ${tx} ${ty})`} textAnchor="middle" dominantBaseline="middle" className={`seg-label ${c.dark ? 'on-dark' : ''}`}>
                {name}
              </text>
            </g>
          );
        })}
        <circle cx={R} cy={R} r={SEG_R} fill="none" stroke="#1f1c35" strokeWidth="4" />
        {Array.from({ length: 24 }, (_, i) => {
          const [x, y] = polar((360 / 24) * i, R - 5);
          return <circle key={i} cx={x} cy={y} r="2.8" className={`bulb ${i % 2 ? 'odd' : ''}`} />;
        })}
      </svg>
      <div className="wheel-hub">
        <Blob size={58} color="ink" />
      </div>
    </div>
  );
}

function DrawStage({ meta, players, now }: { meta: GameMeta; players: Props['players']; now: number }) {
  const draw = meta.draw!;
  const elapsed = now - draw.at;
  const { intro, step: STEP } = drawStepTimes;
  const H = draw.hiders.length;
  const k = Math.min(H - 1, Math.max(0, Math.floor((elapsed - intro) / STEP)));
  const sinceStepStart = elapsed - intro - k * STEP;
  const started = elapsed >= intro;
  const revealed = started && sinceStepStart >= SPIN_MS;
  const remaining = draw.order.filter((id) => !draw.hiders.slice(0, k).includes(id));
  const picked = draw.hiders.slice(0, k + (revealed ? 1 : 0));
  const done = elapsed >= intro + (H - 1) * STEP + SPIN_MS;
  const target = draw.hiders[k]!;
  // Fanfare, sobald das Rad steht
  useEffect(() => {
    if (!revealed) return;
    play('pick');
    buzz(60);
  }, [revealed, k]);

  return (
    <div className="draw-stage">
      <h2 className="draw-title">
        <span>Auslosung</span>
        <small>Wer versteckt sich?</small>
      </h2>
      <Wheel
        key={started ? k : 'idle'}
        ids={remaining}
        players={players}
        target={target}
        seed={draw.seed}
        step={k}
        sinceStepStart={sinceStepStart}
        highlight={revealed}
        idle={!started}
      />
      <div className="draw-result" aria-live="polite">
        {revealed && !done && (
          <div className="pick-burst" key={target}>
            🫣 <strong>{players[target]?.name}</strong> versteckt sich!
          </div>
        )}
        {done && <div className="pick-burst">Alle anderen sind 🔍 Fänger!</div>}
      </div>
      <ul className="picked">
        {picked.map((id) => (
          <li key={id} className="picked-chip">
            <Avatar p={players[id] ?? { name: '?', color: '#888' }} team="hider" size={26} />
            {players[id]?.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersusStage({ meta, players, meId, now }: { meta: GameMeta; players: Props['players']; meId: string; now: number }) {
  const draw = meta.draw!;
  const seekers = draw.order.filter((id) => !draw.hiders.includes(id));
  const toStart = (meta.startedAt ?? now) - now;
  const meHider = draw.hiders.includes(meId);
  const countdown = Math.ceil(toStart / 1000);
  useEffect(() => play('whoosh'), []);
  useEffect(() => {
    if (countdown >= 1 && countdown <= 3) play('count');
    if (countdown === 0) {
      play('go');
      buzz([100, 50, 200]);
    }
  }, [countdown]);
  const team = (ids: string[], side: 'seeker' | 'hider') => (
    <ul className="vs-team">
      {ids.map((id, i) => (
        <li key={id} style={{ animationDelay: `${0.5 + i * 0.15}s` }}>
          <Avatar p={players[id] ?? { name: '?', color: '#888' }} team={side} size={46} />
          <span>{players[id]?.name ?? '?'}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="versus">
      <div className="vs-half hiders">
        <div className="vs-label">
          <Blob size={66} color="peach" hiding className="vs-mascot" />
          VERSTECKER
        </div>
        {team(draw.hiders, 'hider')}
      </div>
      <div className="vs-half seekers">
        <div className="vs-label">
          <Blob size={66} color="ink" magnifier className="vs-mascot" />
          FÄNGER
        </div>
        {team(seekers, 'seeker')}
        <div className="vs-drips">
          <Drips />
        </div>
      </div>
      <div className="vs-badge">VS</div>
      <div className="vs-flash" />
      <div className="vs-footer">
        <strong>{meHider ? 'Du versteckst dich!' : 'Du bist Fänger!'}</strong>
        <span>{meHider ? `Ihr habt ${meta.settings.hideMin} Min, um euer Versteck einzuloggen.` : `${meta.settings.hideMin} Min warten – Zeit für einen Kaffee ☕`}</span>
      </div>
      {toStart <= 3000 && toStart > 0 && (
        <div className="vs-countdown" key={countdown}>
          {countdown}
        </div>
      )}
      {toStart <= 0 && <div className="vs-countdown go">LOS!</div>}
    </div>
  );
}

/** Vollbild-Show: Glücksrad, dann Versus-Screen, dann Countdown */
export function DrawShow({ meta, players, meId, clockOffset, onSkip }: Props) {
  const now = useNow(100) + clockOffset;
  const draw = meta.draw;
  const drawEnd = useMemo(() => (draw ? draw.at + drawDuration(draw.hiders.length) : 0), [draw]);
  if (!draw) return null;
  return (
    <div className="draw-overlay" role="dialog" aria-label="Auslosung">
      <div className="draw-drips" aria-hidden="true">
        <Drips />
      </div>
      <div className="draw-confetti" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      {now < drawEnd ? <DrawStage meta={meta} players={players} now={now} /> : <VersusStage meta={meta} players={players} meId={meId} now={now} />}
      <button className="skip-btn" onClick={onSkip}>
        Überspringen
      </button>
    </div>
  );
}
