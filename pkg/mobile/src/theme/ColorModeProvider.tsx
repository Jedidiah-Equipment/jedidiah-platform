import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, useColorScheme as useNativeColorScheme, View } from 'react-native';

import {
  type ColorModePreference,
  isColorModePreference,
  type ResolvedColorScheme,
  resolveColorModePreference,
} from './color-mode';

export type { ColorModePreference, ResolvedColorScheme } from './color-mode';
export { resolveColorModePreference } from './color-mode';

export type ColorModeContextValue = {
  preference: ColorModePreference;
  resolved: ResolvedColorScheme;
  setPreference: (preference: ColorModePreference) => void;
};

const STORAGE_KEY = 'jedidiah-color-mode';

export const ColorModeContext = createContext<ColorModeContextValue | null>(null);

/**
 * Persists the user's color-mode preference. The gluestack provider consumes the
 * preference directly via its documented `mode` prop and resolves system mode to
 * the current native appearance.
 */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useNativeColorScheme();
  const [preference, setPreferenceState] = useState<ColorModePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  const applyPreference = useCallback((next: ColorModePreference) => {
    setPreferenceState(next);
  }, []);

  // Restore the persisted override once on mount. Gate the tree on this read so
  // legacy or saved preferences never flash the wrong scheme on cold start.
  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;

        const next = isColorModePreference(stored) ? stored : 'system';
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

  const resolved = resolveColorModePreference(preference, systemColorScheme);

  // Mirror the resolved scheme onto <html> for Expo web. Native receives the
  // same preference through GluestackUIProvider.mode.
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
