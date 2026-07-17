import { type Locale, POSTHOG_CLIENT_API_HOST, POSTHOG_UI_HOST } from '@pkg/schema';
import posthog from 'posthog-js';

import { resolvePosthogToken } from './analytics-config.js';

export type AnalyticsEventRegistry = {
  range_card_clicked: { rangeSlug: string; rangeName: string; position: number };
  cta_clicked: {
    cta: 'hero_contact' | 'hero_products' | 'bottom_band_contact';
    placement: 'hero' | 'bottom_band';
  };
  catalog_filter_changed: {
    range: string | null;
    variant: string | null;
    previousRange: string | null;
    previousVariant: string | null;
  };
  product_card_clicked: {
    modelCode: string;
    position: number;
    range: string | null;
    variant: string | null;
  };
  product_viewed: { modelCode: string; range: string; variant: string | null };
  product_shared: { modelCode: string; method: 'native' | 'clipboard' };
  brochure_downloaded: { modelCode: string };
  contact_submitted: { equipment: string };
  contact_submit_failed: { errorCategory: 'network' | 'server' };
  social_link_clicked: { platform: 'instagram' | 'whatsapp'; placement: 'footer' | 'contact_page' };
  phone_link_clicked: { placement: 'nav' | 'footer' | 'contact_page' | 'product_detail' };
  language_switched: { fromLocale: Locale; toLocale: Locale; placement: 'nav' | 'footer' };
};

export type AnalyticsEventName = keyof AnalyticsEventRegistry;
export type AnalyticsEventProperties<Event extends AnalyticsEventName> = AnalyticsEventRegistry[Event];

// Tracks whether posthog-js has been initialised this session so init runs at most once.
let started = false;
let activeLanguage: Locale | undefined;

// Lazily initialises posthog-js the first time analytics is used, but only in the browser and only when a
// PostHog token is configured. Returns whether analytics is live so every public helper no-ops cleanly when
// unconfigured (issue #569).
//
// `api_host` points at the Lander's same-origin `/info` reverse proxy (see posthog-proxy.ts), so ingestion
// and asset requests avoid cross-origin blockers — the @pkg/web pattern. `ui_host` stays PostHog's real
// domain so the toolbar/links resolve. `defaults` adopts the current PostHog snapshot, which enables
// autocapture and `capture_pageview: 'history_change'` — the latter records SPA pageviews from the History
// API that TanStack Router drives, so client navigations register without manual wiring.
function setLanguage(language: Locale): void {
  if (activeLanguage === language) {
    return;
  }

  posthog.register({ language });
  posthog.setPersonProperties({ language });
  activeLanguage = language;
}

function ensureStarted(language: Locale | undefined): boolean {
  if (started) {
    return true;
  }
  if (typeof window === 'undefined' || !language) {
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
    // PostHog invokes `loaded` before scheduling its initial pageview, so the first pageview receives the
    // language super property without replacing the SDK's built-in pageview handling.
    loaded: () => setLanguage(language),
  });
  started = true;
  return true;
}

export function initAnalytics(language: Locale): void {
  if (ensureStarted(language)) {
    setLanguage(language);
  }
}

export function captureEvent<Event extends AnalyticsEventName>(
  event: Event,
  properties: AnalyticsEventProperties<Event>,
): void {
  if (ensureStarted(activeLanguage)) {
    posthog.capture(event, properties);
  }
}

export function captureEventForNavigation<Event extends AnalyticsEventName>(
  event: Event,
  properties: AnalyticsEventProperties<Event>,
): void {
  if (ensureStarted(activeLanguage)) {
    // Full-page and outbound links must not wait on the normal request queue during document teardown.
    posthog.capture(event, properties, { send_instantly: true, transport: 'sendBeacon' });
  }
}
