import { useEffect, useState } from 'react';
import { load, save } from '../lib/storage';

/** useState, das seinen Wert in localStorage behält */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => load(key, initial));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue] as const;
}
