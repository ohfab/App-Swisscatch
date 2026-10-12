import { load, save } from '../lib/storage';

/**
 * Öffentliche MQTT-Broker (gratis, ohne Konto). Die App verbindet sich mit beiden
 * gleichzeitig und sendet alles an beide: fällt einer aus, läuft das Spiel über den
 * anderen weiter. Alle Daten sind mit dem Spielcode verschlüsselt.
 * Eigene Broker: beim Build VITE_MQTT_URL setzen (mehrere mit Komma getrennt)
 * oder die App einmal mit ?broker=wss://…[,wss://…] öffnen.
 */
const splitList = (v: string) =>
  v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export const DEFAULT_BROKERS = splitList((import.meta.env.VITE_MQTT_URL as string | undefined) ?? 'wss://broker.emqx.io:8084/mqtt,wss://broker.hivemq.com:8884/mqtt');

export function brokerUrls(): string[] {
  try {
    const fromUrl = new URLSearchParams(location.search).get('broker');
    if (fromUrl) save('mqtt.url', fromUrl);
  } catch {
    // ohne URL-Zugriff einfach weiter
  }
  const saved = load<string | null>('mqtt.url', null);
  return saved ? splitList(saved) : DEFAULT_BROKERS;
}

export const TOPIC_PREFIX = 'swisscatch/v1';

/** Farben für Spieler-Marker */
export const PLAYER_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
