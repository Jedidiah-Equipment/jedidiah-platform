import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'nativewind';
import { createContext, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

export type ColorModePreference = 'dark' | 'light' | 'system';

/** The concrete scheme after resolving `system` against the OS. */
export type ResolvedColorScheme = 'dark' | 'light';

export type ColorModeContextValue = {
  /** The user's saved override; `system` follows the OS appearance. */
  preference: ColorModePreference;
  /** The concrete scheme after resolving `system` against the OS. */
  resolved: ResolvedColorScheme;
  setPreference: (preference: ColorModePreference) => void;
};

const STORAGE_KEY = 'jedidiah-color-mode';

export const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function isPreference(value: string | null): value is ColorModePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Mirrors web's three-way `ThemeProvider`: color mode follows the OS by default
 * via NativeWind's `useColorScheme`, with a light/dark/system override persisted
 * across launches in AsyncStorage (works on native and web; the preference is not
 * sensitive). The control surface lands in #518.
 */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ColorModePreference>('system');

  // Restore the persisted override once on mount.
  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (active && isPreference(stored)) {
        setPreferenceState(stored);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  // NativeWind resolves `system` against the OS itself, restyling utility classes.
  useEffect(() => {
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  const resolved: ResolvedColorScheme = colorScheme ?? 'light';

  // The theme CSS variables live under `.dark:root`. On web NativeWind only
  // toggles that class for an explicit `dark`/`light`, not for `system`, so the
  // variables would never flip when following the OS. Mirror the resolved scheme
  // onto <html> ourselves (native resolves variables at runtime, no DOM needed).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    globalThis.document?.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const value = useMemo<ColorModeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference: (next) => {
        setPreferenceState(next);
        void AsyncStorage.setItem(STORAGE_KEY, next);
      },
    }),
    [preference, resolved],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}
