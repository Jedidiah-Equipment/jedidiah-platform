import { POSTHOG_CLIENT_API_HOST, POSTHOG_UI_HOST } from '@pkg/schema';
import posthog from 'posthog-js';

import { resolvePosthogToken } from './analytics-config.js';

// Tracks whether posthog-js has been initialised this session so init runs at most once.
let started = false;

// Lazily initialises posthog-js the first time analytics is used, but only in the browser and only when a
// PostHog token is configured. Returns whether analytics is live so every public helper no-ops cleanly when
// unconfigured (issue #569).
//
// `api_host` points at the Lander's same-origin `/info` reverse proxy (see posthog-proxy.ts), so ingestion
// and asset requests avoid cross-origin blockers — the @pkg/web pattern. `ui_host` stays PostHog's real
// domain so the toolbar/links resolve. `defaults` adopts the current PostHog snapshot, which enables
// autocapture and `capture_pageview: 'history_change'` — the latter records SPA pageviews from the History
// API that TanStack Router drives, so client navigations register without manual wiring.
function ensureStarted(): boolean {
  if (started) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }

  const token = resolvePosthogToken(import.meta.env);
  if (!token) {
    return false;
  }

  posthog.init(token, {
    api_host: POSTHOG_CLIENT_API_HOST,
    ui_host: POSTHOG_UI_HOST,
    defaults: '2026-05-30',
  });
  started = true;
  return true;
}

export function initAnalytics(): void {
  ensureStarted();
}

export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  if (ensureStarted()) {
    posthog.capture(event, properties);
  }
}
