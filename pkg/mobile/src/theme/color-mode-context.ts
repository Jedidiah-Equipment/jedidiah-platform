import { createContext } from 'react';

import type { ColorModePreference, ResolvedColorScheme } from './color-mode';

export type ColorModeContextValue = {
  preference: ColorModePreference;
  resolved: ResolvedColorScheme;
  setPreference: (preference: ColorModePreference) => void;
};

/**
 * Lives apart from `ColorModeProvider` so a leaf component reading the scheme does not pull the
 * provider's storage and NativeWind imports in behind it.
 */
export const ColorModeContext = createContext<ColorModeContextValue | null>(null);
