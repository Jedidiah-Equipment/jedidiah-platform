import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

export type ColorModePreference = 'dark' | 'light' | 'system';

export type ResolvedColorScheme = 'dark' | 'light';

export type ColorModeContextValue = {
  preference: ColorModePreference;
  resolved: ResolvedColorScheme;
  setPreference: (preference: ColorModePreference) => void;
};

const STORAGE_KEY = 'jedidiah-color-mode';

export const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function isPreference(value: string | null): value is ColorModePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Keeps the app theme in sync with NativeWind's colour-scheme runtime while
 * persisting the user's preference. System is the default, matching OS changes
 * until the user explicitly chooses light or dark.
 */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useNativeWindColorScheme();
  const [preference, setPreferenceState] = useState<ColorModePreference>('system');
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

        const next = isPreference(stored) ? stored : 'system';
        applyPreference(next);
      })
      .catch(() => {
        if (active) applyPreference('system');
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [applyPreference]);

  const resolved: ResolvedColorScheme = colorScheme ?? 'light';

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
  if (!hydrated) {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: '#0a0a0b',
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <ActivityIndicator accessibilityLabel="Loading theme" color="#fff000" size="large" />
        <Text style={{ color: '#fafafa', fontSize: 16, lineHeight: 24, marginTop: 16, textAlign: 'center' }}>
          Loading theme
        </Text>
      </View>
    );
  }

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}
