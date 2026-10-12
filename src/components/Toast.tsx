import { useEffect, useRef } from 'react';

interface Props {
  message: string | null;
  onDone: () => void;
}

export function Toast({ message, onDone }: Props) {
  // onDone ist oft eine neue Funktion pro Render; der Timer soll nur bei neuer Meldung neu starten
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => done.current(), 2600);
    return () => window.clearTimeout(t);
  }, [message]);

  return (
    <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
