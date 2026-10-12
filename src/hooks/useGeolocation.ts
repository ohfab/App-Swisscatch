import { useCallback, useEffect, useRef, useState } from 'react';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type GeoStatus = 'off' | 'searching' | 'active' | 'denied' | 'unavailable';

/** Live-Standort über die Geolocation-API (startet erst auf Wunsch) */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>('off');
  const [position, setPosition] = useState<Position | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setStatus('off');
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    if (watchId.current !== null) return;
    setStatus('searching');
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        });
        setStatus('active');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
          setStatus('denied');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus((s) => (s === 'active' ? s : 'unavailable'));
        }
        // TIMEOUT: einfach weiter warten
      },
      // maximumAge 0: immer frisch messen, keine zwischengespeicherte (oft grobe) Position
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { status, position, start, stop };
}
