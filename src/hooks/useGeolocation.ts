import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { isNative } from '../lib/native';

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type GeoStatus = 'off' | 'searching' | 'active' | 'denied' | 'unavailable';

/** Watcher-Kennung: Zahl im Browser, Text in der Android-App */
type WatchId = { web: number } | { native: string } | { pending: true };

// Nicht aus einer async-Funktion zurückgeben: Capacitor-Plugins sind Proxys, und `await` würde sie nach `.then` fragen
let plugin: BackgroundGeolocationPlugin | null = null;
function nativeGeo(): BackgroundGeolocationPlugin {
  plugin ??= registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
  return plugin;
}

/**
 * Live-Standort (startet erst auf Wunsch). Im Browser über die Geolocation-API,
 * in der Android-App über das Hintergrund-Plugin: Mit `setBackground(true)`
 * (während eines Spiels) läuft der Standort auch bei gesperrtem Bildschirm weiter.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>('off');
  const [position, setPosition] = useState<Position | null>(null);
  const [background, setBackground] = useState(false);
  const watch = useRef<WatchId | null>(null);
  const bgRef = useRef(background);
  bgRef.current = background;

  const clear = useCallback(() => {
    const w = watch.current;
    watch.current = null;
    if (!w) return;
    if ('web' in w) navigator.geolocation.clearWatch(w.web);
    else if ('native' in w) void nativeGeo().removeWatcher({ id: w.native });
  }, []);

  const stop = useCallback(() => {
    clear();
    setStatus('off');
  }, [clear]);

  const startNative = useCallback(async () => {
    const token: WatchId = { pending: true };
    watch.current = token;
    const g = nativeGeo();
    const bg = bgRef.current;
    const id = await g.addWatcher(
      {
        backgroundTitle: 'Spurlos läuft',
        backgroundMessage: bg ? 'Dein Standort geht verschlüsselt an deine Mitspieler.' : undefined,
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (loc, err) => {
        if (err) {
          if (err.code === 'NOT_AUTHORIZED') {
            clear();
            setStatus('denied');
          }
          return;
        }
        if (!loc) return;
        setPosition({
          lat: loc.latitude,
          lng: loc.longitude,
          accuracy: loc.accuracy,
          heading: loc.bearing,
          speed: loc.speed,
          timestamp: loc.time ?? Date.now(),
        });
        setStatus('active');
      },
    );
    // Inzwischen gestoppt oder neu gestartet? Dann diesen Watcher gleich wieder entfernen
    if (watch.current === token) watch.current = { native: id };
    else void g.removeWatcher({ id });
  }, [clear]);

  const start = useCallback(() => {
    if (watch.current !== null) return;
    if (isNative) {
      setStatus('searching');
      startNative().catch(() => {
        watch.current = null;
        setStatus('unavailable');
      });
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('searching');
    const id = navigator.geolocation.watchPosition(
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
          clear();
          setStatus('denied');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus((s) => (s === 'active' ? s : 'unavailable'));
        }
        // TIMEOUT: einfach weiter warten
      },
      // maximumAge 0: immer frisch messen, keine zwischengespeicherte (oft grobe) Position
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    watch.current = { web: id };
  }, [clear, startNative]);

  // In der App: Wechsel zwischen Vorder- und Hintergrundmodus braucht einen neuen Watcher
  useEffect(() => {
    if (!isNative || !watch.current) return;
    clear();
    startNative().catch(() => setStatus('unavailable'));
  }, [background, clear, startNative]);

  useEffect(() => () => clear(), [clear]);

  return { status, position, start, stop, setBackground };
}
