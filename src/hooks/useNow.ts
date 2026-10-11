import { useEffect, useState } from 'react';

/** Aktuelle Zeit, die sich regelmässig aktualisiert (für Countdowns) */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, active]);
  return now;
}
