const FALLBACK_SCHEME = 'jedidiahops';
const STAGING_SCHEME = 'jedidiahopsstaging';

type ExpoConfigLike = {
  scheme?: string | string[];
};

export function resolveRuntimeScheme(expoConfig: ExpoConfigLike | null | undefined): string {
  const scheme = expoConfig?.scheme;

  if (Array.isArray(scheme)) {
    return scheme[0] || FALLBACK_SCHEME;
  }

  return scheme || FALLBACK_SCHEME;
}

export function isStagingRuntimeApp(expoConfig: ExpoConfigLike | null | undefined): boolean {
  return resolveRuntimeScheme(expoConfig) === STAGING_SCHEME;
}
