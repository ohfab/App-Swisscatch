import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { GameClient, type GameSnapshot } from './client';
import { PLAYER_COLORS } from './config';
import { newCode, normalizeCode } from './crypto';
import { DEFAULT_SETTINGS, type GameSettings, type Me } from './types';
import { usePersistentState } from '../hooks/usePersistentState';
import type { Position } from '../hooks/useGeolocation';

interface Session {
  code: string;
  create?: { name: string; settings: GameSettings };
}

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const initialProfile = (): Me => ({
  id: randomId(),
  name: '',
  color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!,
});

const noopSubscribe = () => () => undefined;
const nullSnapshot = () => null;

/** Einladungslink für ein Spiel */
export function inviteLink(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}?spiel=${code}`;
}

/** Spielcode aus dem Einladungslink lesen (und aus der Adresszeile entfernen) */
export function takeInviteCode(): string | null {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get('spiel');
    if (!code) return null;
    url.searchParams.delete('spiel');
    history.replaceState(null, '', url.toString());
    return normalizeCode(code);
  } catch {
    return null;
  }
}

export function useGame(position: Position | null) {
  const [profile, setProfile] = usePersistentState<Me>('player.v1', initialProfile());
  const [session, setSession] = usePersistentState<Session | null>('game.session.v1', null);
  const [client, setClient] = useState<GameClient | null>(null);

  // Ein Client pro Spiel; beim Verlassen oder Code-Wechsel wird er geschlossen
  useEffect(() => {
    if (!session || !profile.name) return;
    const c = new GameClient(session.code, profile, session.create);
    void c.connect();
    setClient(c);
    return () => {
      c.close();
      setClient(null);
    };
    // Profiländerungen gehen über rename(), nicht über einen neuen Client
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.code, Boolean(profile.name)]);

  const snapshot: GameSnapshot | null = useSyncExternalStore(
    client?.subscribe ?? noopSubscribe,
    client?.getSnapshot ?? nullSnapshot,
  );

  // Standort an das Spiel weitergeben
  useEffect(() => {
    client?.setPosition(position ? { lat: position.lat, lng: position.lng, acc: Math.round(position.accuracy), t: position.timestamp } : null);
  }, [client, position]);

  // Zurück in der App: verpasste Pings nachholen
  useEffect(() => {
    if (!client) return;
    const onVisible = () => document.visibilityState === 'visible' && client.resume();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [client]);

  // Ist das Spiel einmal gefunden, wird es beim Neuladen nicht nochmals angelegt
  useEffect(() => {
    if (session?.create && snapshot?.meta) setSession({ code: session.code });
  }, [session, snapshot?.meta, setSession]);

  const setName = useCallback(
    (name: string) => {
      setProfile((p) => ({ ...p, name }));
      client?.rename(name);
    },
    [client, setProfile],
  );

  const create = useCallback(
    (gameName: string, settings: Partial<GameSettings> = {}) =>
      setSession({ code: newCode(), create: { name: gameName.trim() || 'Spurlos', settings: { ...DEFAULT_SETTINGS, ...settings } } }),
    [setSession],
  );

  const join = useCallback((code: string) => setSession({ code: normalizeCode(code) }), [setSession]);

  const leave = useCallback(async () => {
    await client?.leave();
    setSession(null);
  }, [client, setSession]);

  /** Lokal verlassen, ohne Nachricht (z.B. wenn das Spiel nicht gefunden wurde) */
  const forget = useCallback(() => setSession(null), [setSession]);

  return useMemo(
    () => ({ profile, setName, session, snapshot, client, create, join, leave, forget }),
    [profile, setName, session, snapshot, client, create, join, leave, forget],
  );
}

export type GameApi = ReturnType<typeof useGame>;
