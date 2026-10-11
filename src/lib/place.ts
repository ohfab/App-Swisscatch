export interface Place {
  /** Eindeutig pro Öffnen – setzt den internen Zustand des Sheets zurück */
  key: string;
  lat: number;
  lng: number;
  title?: string;
  subtitle?: string;
  pinId?: string;
  source: 'map' | 'search' | 'pin' | 'me';
}

let counter = 0;
export const placeKey = () => `p${++counter}`;

export function shareLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
