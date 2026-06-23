const FALLBACK_SCHEME = 'jedidiahops';

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
