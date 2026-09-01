import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as nativeWindColorScheme } from 'nativewind';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import { loadingSpinnerColor } from './brand-colors';
import {
  type ColorModePreference,
  DEFAULT_COLOR_MODE,
  parseColorModePreference,
  resolveColorModePreference,
} from './color-mode';
import { ColorModeContext, type ColorModeContextValue } from './color-mode-context';

export type { ColorModePreference, ResolvedColorScheme } from './color-mode';
export { resolveColorModePreference } from './color-mode';
export type { ColorModeContextValue } from './color-mode-context';

const STORAGE_KEY = 'jedidiah-color-mode';

/**
 * Persists the user's explicit color-mode preference. Invalid and legacy values
 * fall back to dark so the profile menu never opens with an unselectable state.
 */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ColorModePreference>(DEFAULT_COLOR_MODE);
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

        applyPreference(parseColorModePreference(stored));
      })
      .catch(() => {
        if (active) applyPreference(DEFAULT_COLOR_MODE);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [applyPreference]);

  const resolved = resolveColorModePreference(preference);

  // Mirror the resolved scheme onto <html> for Expo web. Native receives the
  // same preference through GluestackUIProvider.mode.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    globalThis.document?.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  // GluestackUIProvider only swaps the CSS variable set, which the semantic tokens read. NativeWind
  // resolves `dark:` utilities from its own colour-scheme store instead, and on native that store
  // follows the device unless told otherwise. Shared palettes no longer rely on that — each surface
  // names the half its scheme paints — but any `dark:` class written inline still does, so hand
  // NativeWind the preference before the tree paints.
  useLayoutEffect(() => {
    nativeWindColorScheme.set(resolved);
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
        <ActivityIndicator accessibilityLabel="Loading theme" color={loadingSpinnerColor} size="large" />
        <Text style={{ color: '#fafafa', fontSize: 16, lineHeight: 24, marginTop: 16, textAlign: 'center' }}>
          Loading theme
        </Text>
      </View>
    );
  }

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}
