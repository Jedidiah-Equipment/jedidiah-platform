export type AppEnv = 'development' | 'staging' | 'production';

export function resolveAppEnv(value: string | undefined): AppEnv {
  if (value === 'staging' || value === 'production') return value;

  return 'development';
}

export function resolveLanderOrigin(value: string | undefined): string {
  return (value ?? 'http://localhost:7004').replace(/\/+$/, '');
}

// Expo only inlines literal process.env.EXPO_PUBLIC_* member expressions.
export const appEnv = resolveAppEnv(process.env.EXPO_PUBLIC_APP_ENV);
export const isStagingAppEnv = appEnv === 'staging';
export const landerOrigin = resolveLanderOrigin(process.env.EXPO_PUBLIC_LANDER_ORIGIN);
