import { useEffect, useLayoutEffect, useState } from 'react';
import { GeistiSays } from './Geisti';
import type { GhostMood } from './Art';
import { play } from '../lib/sound';

interface TourStep {
  /** Element mit data-tour="…" (ohne: Geisti in der Mitte) */
  target?: string;
  mood: GhostMood;
  text: string;
  magnifier?: boolean;
  party?: boolean;
}

const STEPS: TourStep[] = [
  { target: 'search', mood: 'happy', text: 'Hier findest du jeden Ort der Schweiz: Städte, Adressen, Berge, Seen und Postleitzahlen.' },
  { mood: 'love', text: 'Drück irgendwo lange auf die Karte (am PC: Rechtsklick). Dann zeige ich dir Höhe, Kanton, Koordinaten und die nächsten Abfahrten.' },
  { target: 'locate', mood: 'surprised', text: 'Hier springst du zu deinem Standort. Nochmals tippen, und die Karte folgt dir.' },
  { target: 'layers', mood: 'cool', text: 'Strassenkarte, Luftbild, Landeskarte oder Winter? Hier wechselst du die Karte und blendest ÖV und Wanderwege ein.' },
  { target: 'tab-route', mood: 'happy', text: 'Der Fahrplan: Verbindungen von A nach B, mit Gleis, Umstiegen und Verspätungen.' },
  { target: 'tab-pins', mood: 'wink', text: 'Deine gespeicherten Orte – Treffpunkte, Lieblingsplätze oder Verstecke.' },
  { target: 'tab-game', mood: 'think', magnifier: true, text: 'Und hier beginnt das Abenteuer: das Versteckspiel quer durch die Schweiz! 🕵️' },
  { target: 'profile', mood: 'cheer', party: true, text: 'Tipp auf mich, dann siehst du dein Level, deine Abzeichen und alle Kantone, in denen du schon warst. Viel Spass!' },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measure(target?: string): Rect | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const pad = 6;
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
}

/** Geführte Tour: Geisti zeigt der Reihe nach auf die wichtigsten Stellen */
export function Tour({ onDone }: { onDone: (completed: boolean) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  useLayoutEffect(() => {
    const update = () => setRect(measure(step.target));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const next = () => {
    play('tick');
    if (last) onDone(true);
    else setI(i + 1);
  };

  // Geisti dort hinstellen, wo Platz ist: unter dem Ziel oder darüber
  const vh = window.innerHeight;
  const below = !rect || rect.y + rect.h < vh * 0.5;
  const pos: React.CSSProperties = !rect ? { top: '30%' } : below ? { top: rect.y + rect.h + 12 } : { bottom: vh - rect.y + 12 };

  return (
    <div className="tour" role="dialog" aria-label="Tour mit Geisti" onClick={next}>
      <div
        className={`tour-spot ${rect ? '' : 'none'}`}
        style={rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
      />
      <div className={`tour-card ${below ? 'below' : 'above'}`} style={pos} key={i} onClick={(e) => e.stopPropagation()}>
        <GeistiSays text={step.text} mood={step.mood} magnifier={step.magnifier} party={step.party} size={92} side="right" />
        <div className="tour-actions">
          <span className="tour-count">
            {i + 1} / {STEPS.length}
          </span>
          <button className="link inline" onClick={() => onDone(false)}>
            Beenden
          </button>
          <button className="wide-btn start" onClick={next}>
            {last ? 'Fertig! 🎉' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
