import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A typed useState-like hook backed by LocalStorage.
 * Reads once on mount, writes on every change, and never throws
 * (falls back to the initial value if storage is unavailable/corrupt).
 *
 * @param key - localStorage key
 * @param initialValue - default value or factory function
 * @param migrate - optional transformer applied to loaded data before returning it.
 *                  Use this to repair/upgrade stale or partial state from storage.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  migrate?: (raw: T) => T,
) {
  const initialRef = useRef(initialValue);
  const migrateRef = useRef(migrate);

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw) as T;
        // Apply migration/repair transform if provided
        return migrateRef.current ? migrateRef.current(parsed) : parsed;
      }
    } catch {
      // corrupt storage — fall through to default
    }
    const init = initialRef.current;
    return init instanceof Function ? init() : init;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or unavailable — fail silently, in-memory state still works
    }
  }, [key, value]);

  const remove = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
    const init = initialRef.current;
    setValue(init instanceof Function ? init() : init);
  }, [key]);

  return [value, setValue, remove] as const;
}
