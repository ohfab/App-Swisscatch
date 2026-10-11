const PREFIX = 'swisscatch.';

/** localStorage lesen – liefert den Fallback, wenn nichts da ist oder der Zugriff scheitert */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Privater Modus oder Speicher voll: App funktioniert trotzdem, nur ohne Persistenz
  }
}
