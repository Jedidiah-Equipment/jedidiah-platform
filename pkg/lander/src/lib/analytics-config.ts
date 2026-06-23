// Resolves the public PostHog project token from Vite env, or null when none is set. Returning null keeps
// the Lander analytics-free locally and in any environment that hasn't opted in: posthog-js never
// initialises, the reverse proxy stays closed, and every capture call no-ops (issue #569). The ingest/asset
// hosts are not configured here — the client always talks to the same-origin `/info` proxy (see analytics.ts
// and posthog-proxy.ts), mirroring @pkg/web. Kept free of `posthog-js` so the gate stays unit-testable.
export function resolvePosthogToken(env: ImportMetaEnv): string | null {
  const token = env.VITE_POSTHOG_KEY?.trim();
  return token && token.length > 0 ? token : null;
}
