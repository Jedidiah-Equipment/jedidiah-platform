export type AppEnv = 'development' | 'staging' | 'production';

export function resolveAppEnv(value: string | undefined): AppEnv {
  if (value === 'staging' || value === 'production') return value;

  return 'development';
}

// Expo only inlines literal process.env.EXPO_PUBLIC_* member expressions.
export const appEnv = resolveAppEnv(process.env.EXPO_PUBLIC_APP_ENV);
export const isStagingAppEnv = appEnv === 'staging';
