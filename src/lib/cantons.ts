import { pointInGeometry, type LatLng } from './geo';

export interface CantonProps {
  id: number;
  abbr: string;
  name: string;
  capital: string;
  languages: string[];
  areaKm2: number;
  color: number;
  neighbors: string[];
  label: [number, number];
}

export type CantonFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, CantonProps>;
export type CantonCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, CantonProps>;
export type CountryFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

let cantonsPromise: Promise<CantonCollection> | null = null;
let countryPromise: Promise<CountryFeature> | null = null;

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!res.ok) throw new Error(`${file} konnte nicht geladen werden`);
  return (await res.json()) as T;
}

export function loadCantons(): Promise<CantonCollection> {
  cantonsPromise ??= fetchJson<CantonCollection>('cantons.geojson').catch((err) => {
    cantonsPromise = null;
    throw err;
  });
  return cantonsPromise;
}

export function loadSwitzerland(): Promise<CountryFeature> {
  countryPromise ??= fetchJson<CountryFeature>('switzerland.geojson').catch((err) => {
    countryPromise = null;
    throw err;
  });
  return countryPromise;
}

/** Kanton, in dem ein Punkt liegt (oder null ausserhalb der Schweiz) */
export async function findCanton(p: LatLng): Promise<CantonFeature | null> {
  const cantons = await loadCantons();
  return cantons.features.find((f) => pointInGeometry(p, f.geometry)) ?? null;
}
