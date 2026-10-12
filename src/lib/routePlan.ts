import type { Endpoint, RouteResult } from './transport';

/* Fahrplan-Eingaben, ohne das Fahrplan-Fenster selbst (das lädt erst bei Bedarf) */

export const ME: Endpoint = { kind: 'me', label: 'Mein Standort' };

export interface RoutePlan {
  from: Endpoint | null;
  to: Endpoint | null;
  mode: 'now' | 'depart' | 'arrival';
  /** "YYYY-MM-DDTHH:MM" in Schweizer Zeit */
  at: string;
  result: RouteResult | null;
  selectedId: string | null;
}

/** Aktuelle Zeit in der Schweiz als "YYYY-MM-DDTHH:MM" */
export function zurichNow(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(' ', 'T');
}

export const emptyPlan = (): RoutePlan => ({
  from: ME,
  to: null,
  mode: 'now',
  at: zurichNow(),
  result: null,
  selectedId: null,
});

