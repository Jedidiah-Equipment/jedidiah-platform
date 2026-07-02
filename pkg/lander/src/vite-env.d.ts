/// <reference types="vite/client" />

// Public PostHog project token exposed to the client bundle. Optional so the Lander runs analytics-free
// when unset (issue #569). Ingest/asset hosts are not env-driven — the client uses the same-origin `/info`
// reverse proxy.
interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  // Public site origin for the sitemap and robots.txt, the only place a fully-qualified URL is required.
  // Optional and build-time; defaults to the live domain when unset. See lib/seo.ts.
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
