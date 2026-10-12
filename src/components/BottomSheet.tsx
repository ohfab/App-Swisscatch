import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Untertitel, wenn das Sheet zur schmalen Leiste verkleinert ist */
  peekSubtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Zusätzliche Aktion rechts neben dem Titel */
  headerAction?: ReactNode;
  label: string;
  /** Verkleinert (nur Titel sichtbar); ohne Angabe verwaltet das Sheet das selbst */
  peek?: boolean;
  onPeekChange?: (peek: boolean) => void;
  /** Ändert sich der Wert, springt der Inhalt wieder nach oben */
  scrollKey?: string | number;
}

/**
 * Bottom-Sheet im App-Stil. Nach unten wischen verkleinert es zur Leiste,
 * nochmals wischen oder ✕ schliesst es. Tippen auf die Leiste klappt es wieder auf.
 */
export function BottomSheet(props: Props) {
  const { title, subtitle, peekSubtitle, onClose, children, headerAction, label } = props;
  const [innerPeek, setInnerPeek] = useState(false);
  const peek = props.peek ?? innerPeek;
  const setPeek = props.onPeekChange ?? setInnerPeek;
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [props.scrollKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    const dy = e.clientY - start.current;
    if (Math.abs(dy) > 6) moved.current = true;
    setDragY(peek ? Math.min(0, dy) : Math.max(0, dy));
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (!moved.current) {
      // einfacher Tipp auf den Griff: auf- bzw. zuklappen
      setPeek(!peek);
    } else if (!peek && dragY > 220) onClose();
    else if (!peek && dragY > 60) setPeek(true);
    else if (peek && dragY < -40) setPeek(false);
    setDragY(0);
  };

  return (
    <section
      className={`sheet ${peek ? 'peek' : ''}`}
      role="dialog"
      aria-label={label}
      style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
    >
      <div
        className="sheet-grip"
        role="button"
        aria-label={peek ? 'Aufklappen' : 'Verkleinern'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span />
      </div>
      <header className="sheet-header" onClick={peek ? () => setPeek(false) : undefined}>
        <div className="sheet-titles">
          <h2>{title}</h2>
          {(peek && peekSubtitle ? peekSubtitle : subtitle) && <p>{peek && peekSubtitle ? peekSubtitle : subtitle}</p>}
        </div>
        {headerAction}
        <button
          className="icon-btn subtle"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Schliessen"
        >
          <CloseIcon size={20} />
        </button>
      </header>
      <div className="sheet-body" hidden={peek} ref={body}>
        {children}
      </div>
    </section>
  );
}
