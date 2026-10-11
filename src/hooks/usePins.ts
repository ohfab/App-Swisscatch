import { useCallback } from 'react';
import { usePersistentState } from './usePersistentState';

export const PIN_COLORS = ['#D52B1E', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0f172a'] as const;

export interface Pin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  createdAt: number;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function usePins() {
  const [pins, setPins] = usePersistentState<Pin[]>('pins.v1', []);

  const addPin = useCallback(
    (data: Omit<Pin, 'id' | 'createdAt'>): Pin => {
      const pin: Pin = { ...data, id: newId(), createdAt: Date.now() };
      setPins((list) => [pin, ...list]);
      return pin;
    },
    [setPins],
  );

  const updatePin = useCallback(
    (id: string, patch: Partial<Omit<Pin, 'id'>>) =>
      setPins((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    [setPins],
  );

  const removePin = useCallback((id: string) => setPins((list) => list.filter((p) => p.id !== id)), [setPins]);

  return { pins, addPin, updatePin, removePin };
}
