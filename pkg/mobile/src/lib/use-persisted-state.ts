import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/** Type guard over a fixed set of string literals, for persisted-preference validation. */
export function createLiteralGuard<const T extends readonly string[]>(values: T) {
  return (value: unknown): value is T[number] => values.includes(value as T[number]);
}

function parseStored(stored: string): unknown {
  try {
    return JSON.parse(stored);
  } catch {
    return undefined;
  }
}

/**
 * Session state mirrored to AsyncStorage, following the app's persisted-preference
 * convention (see {@link ColorModeProvider}): restore once on mount, persist on every
 * change, and fall back to `fallback` if the read fails or the stored value no longer
 * passes `isValid`. AsyncStorage works on native and web; these preferences are not
 * sensitive.
 *
 * Unlike ColorModeProvider this does NOT gate first paint — callers render `fallback`
 * until the stored value hydrates, accepting a one-frame update rather than blocking
 * boot. Pass a stable (module-level) `isValid` so the restore effect runs once.
 */
export function usePersistedState<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(key)
      .then((stored) => {
        if (!active || stored === null) return;

        const parsed = parseStored(stored);
        if (isValid(parsed)) setValue(parsed);
      })
      // A failed read just keeps the fallback — never let it block boot.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [key, isValid]);

  const persist = useCallback(
    (next: T) => {
      setValue(next);
      void AsyncStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  return [value, persist];
}
