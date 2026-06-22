import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
// NativeWind's wrapper throws if called before the compiled CSS dark-mode flag registers.
import { useColorScheme } from 'react-native-css-interop';

export type ColorModePreference = 'dark' | 'light';

export type ResolvedColorScheme = 'dark' | 'light';

export type ColorModeContextValue = {
  preference: ColorModePreference;
  resolved: ResolvedColorScheme;
  setPreference: (preference: ColorModePreference) => void;
};

const STORAGE_KEY = 'jedidiah-color-mode';

export const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function isPreference(value: string | null): value is ColorModePreference {
  return value === 'light' || value === 'dark';
}

/**
 * Keeps the app on an explicit light/dark mode, defaulting to dark to match the
 * web app. Legacy `system` values are treated as missing and migrate to dark.
 */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ColorModePreference>('dark');
  const [hydrated, setHydrated] = useState(false);

  const applyPreference = useCallback(
    (next: ColorModePreference) => {
      setPreferenceState(next);
      setColorScheme(next);
    },
    [setColorScheme],
  );

  // Restore the persisted override once on mount. Gate the tree on this read so
  // legacy or saved preferences never flash the wrong scheme on cold start.
  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;

        const next = isPreference(stored) ? stored : 'dark';
        applyPreference(next);
        if (stored && stored !== next) void AsyncStorage.setItem(STORAGE_KEY, next);
      })
      .catch(() => {
        if (active) applyPreference('dark');
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [applyPreference]);

  const resolved: ResolvedColorScheme = colorScheme ?? preference;

  // The theme CSS variables live under `.dark:root`; mirror NativeWind's resolved
  // scheme onto <html> for Expo web (native resolves variables at runtime).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    globalThis.document?.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const value = useMemo<ColorModeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference: (next) => {
        applyPreference(next);
        void AsyncStorage.setItem(STORAGE_KEY, next);
      },
    }),
    [applyPreference, preference, resolved],
  );

  // Hold first paint until the persisted preference is applied (see above).
  if (!hydrated) return null;

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}
