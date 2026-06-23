export type ColorModePreference = 'dark' | 'light';

export type ResolvedColorScheme = 'dark' | 'light';

export const DEFAULT_COLOR_MODE: ColorModePreference = 'dark';

export function isColorModePreference(value: string | null): value is ColorModePreference {
  return value === 'light' || value === 'dark';
}

export function parseColorModePreference(value: string | null): ColorModePreference {
  return isColorModePreference(value) ? value : DEFAULT_COLOR_MODE;
}

export function resolveColorModePreference(preference: ColorModePreference): ResolvedColorScheme {
  return preference;
}
