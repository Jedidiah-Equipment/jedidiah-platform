/// <reference types="vite/client" />

// Public PostHog project token exposed to the client bundle. Optional so the Lander runs analytics-free
// when unset (issue #569). Ingest/asset hosts are not env-driven — the client uses the same-origin `/info`
// reverse proxy.
interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
