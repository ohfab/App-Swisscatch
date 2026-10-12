import { useRef, useState, type ReactNode } from 'react';
import { Blob, Drips } from './Art';
import { MapIcon, PinIcon, TrainIcon } from './Icons';

interface Slide {
  art: ReactNode;
  title: ReactNode;
  text: string;
}

const SLIDES: Slide[] = [
  {
    art: <Blob size={170} color="ink" />,
    title: (
      <>
        <strong>Hoi!</strong> Ich bin Blobi.
      </>
    ),
    text: 'Willkommen bei Spurlos – dem Versteckspiel quer durch die Schweiz, mit Karte und ÖV-Fahrplan.',
  },
  {
    art: (
      <div className="ob-icons">
        <span>
          <MapIcon size={34} />
        </span>
        <span>
          <TrainIcon size={34} />
        </span>
        <span>
          <PinIcon size={34} />
        </span>
      </div>
    ),
    title: (
      <>
        <strong>Karte</strong> und Fahrplan
      </>
    ),
    text: 'Such Orte, drück lange auf die Karte für Höhe, Kanton und Abfahrten, und finde ÖV-Verbindungen in der ganzen Schweiz.',
  },
  {
    art: (
      <div className="ob-duo">
        <Blob size={130} color="peach" hiding />
        <Blob size={140} color="ink" magnifier />
      </div>
    ),
    title: (
      <>
        <strong>Verstecken</strong> oder suchen
      </>
    ),
    text: 'Die Hälfte versteckt sich, die anderen suchen – mit Power-ups, Fallen, Challenges und Team-Chat.',
  },
  {
    art: <img className="ob-app-icon" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={150} height={150} />,
    title: (
      <>
        <strong>Hol dir</strong> die App
      </>
    ),
    text: 'Installiere Spurlos auf PC oder Handy – gratis und ohne App Store. Spielt sich am besten auf dem Handy.',
  },
];

export function Onboarding({ onDone, onOpenApp }: { onDone: () => void; onOpenApp: () => void }) {
  const [i, setI] = useState(0);
  const start = useRef<number | null>(null);
  const last = i === SLIDES.length - 1;
  const next = () => (last ? onDone() : setI(i + 1));
  const slide = SLIDES[i]!;

  return (
    <div
      className="onboarding"
      role="dialog"
      aria-label="Einführung"
      onPointerDown={(e) => (start.current = e.clientX)}
      onPointerUp={(e) => {
        if (start.current === null) return;
        const dx = e.clientX - start.current;
        start.current = null;
        if (dx < -50) next();
        else if (dx > 50 && i > 0) setI(i - 1);
      }}
    >
      <div className="ob-drips" aria-hidden="true">
        <Drips />
      </div>
      <button className="ob-skip" onClick={onDone}>
        Überspringen
      </button>
      <div className="ob-slide" key={i}>
        <div className="ob-art">{slide.art}</div>
        <h2 className="ob-title">{slide.title}</h2>
        <p className="ob-text">{slide.text}</p>
        {last && (
          <button
            className="wide-btn secondary ob-app-btn"
            onClick={() => {
              onDone();
              onOpenApp();
            }}
          >
            📲 App herunterladen
          </button>
        )}
      </div>
      <div className="ob-footer">
        <div className="ob-dots" aria-label={`Seite ${i + 1} von ${SLIDES.length}`}>
          {SLIDES.map((_, k) => (
            <button key={k} className={k === i ? 'active' : ''} aria-label={`Seite ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
        <button className="ob-next" onClick={next}>
          {last ? 'Los!' : 'Weiter'}
        </button>
      </div>
    </div>
  );
}
