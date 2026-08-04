export type AppEnv = 'development' | 'staging' | 'production';

export function resolveAppEnv(value: string | undefined): AppEnv {
  if (value === 'staging' || value === 'production') return value;

  return 'development';
}

function resolveOrigin(value: string | undefined, fallback: string): string {
  return (value ?? fallback).replace(/\/+$/, '');
}

export function resolveLanderOrigin(value: string | undefined): string {
  return resolveOrigin(value, 'http://localhost:7004');
}

// The docs dev server sits outside the parallel slot port scheme: it starts at 5173 and steps to the
// next free port, so a second checkout's Help opens slot zero's docs unless this is set explicitly.
export function resolveDocsOrigin(value: string | undefined): string {
  return resolveOrigin(value, 'http://localhost:5173');
}

// Expo only inlines literal process.env.EXPO_PUBLIC_* member expressions.
export const appEnv = resolveAppEnv(process.env.EXPO_PUBLIC_APP_ENV);
export const isStagingAppEnv = appEnv === 'staging';
export const landerOrigin = resolveLanderOrigin(process.env.EXPO_PUBLIC_LANDER_ORIGIN);
export const docsOrigin = resolveDocsOrigin(process.env.EXPO_PUBLIC_DOCS_ORIGIN);
