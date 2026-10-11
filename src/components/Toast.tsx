import { useEffect } from 'react';

interface Props {
  message: string | null;
  onDone: () => void;
}

export function Toast({ message, onDone }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(t);
  }, [message, onDone]);

  return (
    <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
