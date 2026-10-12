/*
 * Wetter für einen Punkt über Open-Meteo (gratis, ohne Schlüssel, Daten unter CC BY 4.0).
 * Antworten werden 15 Minuten pro Ort zwischengespeichert.
 */

export interface Weather {
  temp: number;
  code: number;
  wind: number;
  isDay: boolean;
  max: number;
  min: number;
  rain: number | null;
  sunset: string | null;
}

export const WEATHER_CREDIT = 'Wetter: Open-Meteo.com';

const cache = new Map<string, { t: number; w: Weather }>();

export async function fetchWeather(p: { lat: number; lng: number }, signal?: AbortSignal): Promise<Weather> {
  const key = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 15 * 60_000) return hit.w;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(4)}&longitude=${p.lng.toFixed(4)}` +
    '&current=temperature_2m,weather_code,wind_speed_10m,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset' +
    '&timezone=Europe%2FZurich&forecast_days=1';
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Wetter nicht erreichbar');
  const d = await res.json();
  if (d.error || !d.current) throw new Error('Wetter nicht erreichbar');
  const w: Weather = {
    temp: d.current.temperature_2m,
    code: d.current.weather_code,
    wind: d.current.wind_speed_10m,
    isDay: d.current.is_day === 1,
    max: d.daily?.temperature_2m_max?.[0],
    min: d.daily?.temperature_2m_min?.[0],
    rain: d.daily?.precipitation_probability_max?.[0] ?? null,
    sunset: d.daily?.sunset?.[0]?.slice(11, 16) ?? null,
  };
  cache.set(key, { t: Date.now(), w });
  return w;
}

/** WMO-Wettercode als Symbol und Text */
export function describeWeather(code: number, isDay = true): { icon: string; text: string } {
  if (code === 0) return isDay ? { icon: '☀️', text: 'Sonnig' } : { icon: '🌙', text: 'Klar' };
  if (code === 1) return { icon: isDay ? '🌤️' : '🌙', text: 'Meist klar' };
  if (code === 2) return { icon: '⛅', text: 'Teilweise bewölkt' };
  if (code === 3) return { icon: '☁️', text: 'Bedeckt' };
  if (code === 45 || code === 48) return { icon: '🌫️', text: 'Nebel' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', text: 'Nieselregen' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', text: 'Regen' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', text: 'Schnee' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', text: 'Regenschauer' };
  if (code === 85 || code === 86) return { icon: '🌨️', text: 'Schneeschauer' };
  if (code >= 95) return { icon: '⛈️', text: 'Gewitter' };
  return { icon: '🌡️', text: 'Wetter' };
}
