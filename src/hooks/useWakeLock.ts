import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> };

/** Bildschirm anlassen, solange aktiv (damit Standort und Pings weiterlaufen) */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!active || !wl) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const request = () =>
      wl
        .request('screen')
        .then((s) => {
          if (cancelled) void s.release();
          else sentinel = s;
        })
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active]);
}

export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;
