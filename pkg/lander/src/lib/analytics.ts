import { type Locale, POSTHOG_CLIENT_API_HOST, POSTHOG_UI_HOST } from '@pkg/schema';
import posthog from 'posthog-js';

import { resolvePosthogToken } from './analytics-config.js';
import type { MetaMatchKeys } from './meta-pixel.js';

const INTERNAL_USER_STORAGE_KEY = 'is_internal';

export type AnalyticsEventRegistry = {
  range_card_clicked: { rangeSlug: string; rangeName: string; position: number };
  cta_clicked: {
    cta: 'hero_contact' | 'hero_products' | 'bottom_band_contact' | 'footer_contact';
    placement: 'hero' | 'bottom_band' | 'footer';
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
  product_viewed: MetaMatchKeys & { modelCode: string; range: string; variant: string | null; metaEventId: string };
  catalog_viewed: MetaMatchKeys & { range: string | null; variant: string | null; metaEventId: string };
  product_shared: { modelCode: string; method: 'native' | 'clipboard' };
  brochure_downloaded: { modelCode: string };
  contact_form_started: Record<string, never>;
  contact_submitted: MetaMatchKeys & { equipment: string; metaEventId: string };
  contact_submit_blocked: { missingFields: string[] };
  contact_submit_failed: { errorCategory: 'network' | 'server' };
  social_link_clicked: {
    platform: 'facebook' | 'instagram' | 'whatsapp';
    placement: 'footer' | 'contact_page';
  };
  email_linked_clicked: { placement: 'contact_page' };
  phone_link_clicked: { placement: 'nav' | 'footer' | 'contact_page' | 'product_detail' };
  language_switched: { fromLocale: Locale; toLocale: Locale; placement: 'nav' | 'footer' };
};

export type AnalyticsEventName = keyof AnalyticsEventRegistry;
export type AnalyticsEventProperties<Event extends AnalyticsEventName> = AnalyticsEventRegistry[Event];

// Tracks whether posthog-js has been initialised this session so init runs at most once.
let started = false;
let activeLanguage: Locale | undefined;
// The locale the page rendered in, known from the moment analytics is armed. `activeLanguage` is only set
// once PostHog has actually loaded, so without this an interaction during the deferral window would find no
// language and drop the event instead of starting the SDK.
let pendingLanguage: Locale | undefined;

export function isInternalUser(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(INTERNAL_USER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

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
  if (isInternalUser()) {
    return false;
  }
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

export function setInternalUser(internal: boolean): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    if (internal) {
      window.localStorage.setItem(INTERNAL_USER_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(INTERNAL_USER_STORAGE_KEY);
    }
  } catch {
    return isInternalUser();
  }

  if (internal) {
    if (started) {
      posthog.opt_out_capturing();
    }
  } else if (ensureStarted(activeLanguage ?? pendingLanguage)) {
    // Resuming capture should not create a synthetic consent event for this hidden internal control.
    posthog.opt_in_capturing({ captureEventName: false });
  }

  return internal;
}

export function initAnalytics(language: Locale): void {
  pendingLanguage = language;
  if (ensureStarted(language)) {
    setLanguage(language);
  }
}

// Arms analytics without paying for it during the load. `posthog.init` is the expensive half — it installs
// autocapture listeners, reads storage and opens the ingestion connection — and it lands squarely in the
// window Total Blocking Time measures, while nothing about a pageview needs it before the page is
// interactive. (Evaluating the module itself is not deferred: posthog-js is a static import here, reached
// from nav and footer, so it is in the entry bundle either way.) The language is recorded synchronously, so
// a click that beats the idle callback starts the SDK itself rather than being lost.
//
// Returns a cancel function for the caller's effect cleanup.
export function initAnalyticsWhenIdle(language: Locale): () => void {
  pendingLanguage = language;

  if (typeof window === 'undefined') {
    return () => {};
  }

  // requestIdleCallback is still unimplemented in Safari; the timeout also bounds how long a busy main
  // thread can postpone the first pageview.
  if (typeof window.requestIdleCallback !== 'function') {
    const handle = window.setTimeout(() => initAnalytics(language), 1);

    return () => window.clearTimeout(handle);
  }

  const handle = window.requestIdleCallback(() => initAnalytics(language), { timeout: 2000 });

  return () => window.cancelIdleCallback(handle);
}

export function captureEvent<Event extends AnalyticsEventName>(
  event: Event,
  properties: AnalyticsEventProperties<Event>,
): void {
  if (ensureStarted(activeLanguage ?? pendingLanguage)) {
    posthog.capture(event, properties);
  }
}

export function captureEventForNavigation<Event extends AnalyticsEventName>(
  event: Event,
  properties: AnalyticsEventProperties<Event>,
): void {
  if (ensureStarted(activeLanguage ?? pendingLanguage)) {
    // Full-page and outbound links must not wait on the normal request queue during document teardown.
    posthog.capture(event, properties, { send_instantly: true, transport: 'sendBeacon' });
  }
}
