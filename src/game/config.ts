import { load, save } from '../lib/storage';

/**
 * Öffentlicher MQTT-Broker (gratis, ohne Konto). Alle Daten sind mit dem Spielcode
 * verschlüsselt. Für einen eigenen Broker beim Build VITE_MQTT_URL setzen
 * oder die App einmal mit ?broker=wss://… öffnen.
 */
export const DEFAULT_BROKER = (import.meta.env.VITE_MQTT_URL as string | undefined) ?? 'wss://broker.emqx.io:8084/mqtt';

export function brokerUrl(): string {
  try {
    const fromUrl = new URLSearchParams(location.search).get('broker');
    if (fromUrl) save('mqtt.url', fromUrl);
  } catch {
    // ohne URL-Zugriff einfach weiter
  }
  return load<string | null>('mqtt.url', null) ?? DEFAULT_BROKER;
}

export const TOPIC_PREFIX = 'swisscatch/v1';

/** Farben für Spieler-Marker */
export const PLAYER_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
