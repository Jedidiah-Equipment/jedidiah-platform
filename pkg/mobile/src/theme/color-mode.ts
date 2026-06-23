export type ColorModePreference = 'dark' | 'light' | 'system';

export type ResolvedColorScheme = 'dark' | 'light';

export function isColorModePreference(value: string | null): value is ColorModePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveColorModePreference(
  preference: ColorModePreference,
  systemColorScheme: string | null | undefined,
): ResolvedColorScheme {
  if (preference !== 'system') return preference;
  return systemColorScheme === 'dark' ? 'dark' : 'light';
}
