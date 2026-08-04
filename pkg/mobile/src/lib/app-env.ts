import { resolveDocsOrigin } from '@pkg/domain';

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

// Expo only inlines literal process.env.EXPO_PUBLIC_* member expressions.
export const appEnv = resolveAppEnv(process.env.EXPO_PUBLIC_APP_ENV);
export const isStagingAppEnv = appEnv === 'staging';
export const landerOrigin = resolveLanderOrigin(process.env.EXPO_PUBLIC_LANDER_ORIGIN);
// Null unless a docs site is configured — store builds get theirs from `eas.json`, local dev from
// `EXPO_PUBLIC_DOCS_ORIGIN`. Without one the app shows no Help at all.
export const docsOrigin = resolveDocsOrigin(process.env.EXPO_PUBLIC_DOCS_ORIGIN, appEnv);
