import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Zusätzliche Aktion rechts neben dem Titel */
  headerAction?: ReactNode;
  label: string;
}

/** Bottom-Sheet im App-Stil – nach unten wischen oder ✕ schliesst es */
export function BottomSheet({ title, subtitle, onClose, children, headerAction, label }: Props) {
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    setDragY(Math.max(0, e.clientY - start.current));
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (dragY > 90) onClose();
    setDragY(0);
  };

  return (
    <section
      className="sheet"
      role="dialog"
      aria-label={label}
      style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
    >
      <div
        className="sheet-grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span />
      </div>
      <header className="sheet-header">
        <div className="sheet-titles">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {headerAction}
        <button className="icon-btn subtle" onClick={onClose} aria-label="Schliessen">
          <CloseIcon size={20} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}
