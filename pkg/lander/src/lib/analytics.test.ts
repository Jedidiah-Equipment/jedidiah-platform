// @vitest-environment jsdom

import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';

import type { AnalyticsEventName, AnalyticsEventProperties, captureEvent as CaptureEvent } from './analytics.js';

const posthog = vi.hoisted(() => ({
  capture: vi.fn(),
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  register: vi.fn(),
  setPersonProperties: vi.fn(),
}));
const resolvePosthogToken = vi.hoisted(() => vi.fn());

vi.mock('posthog-js', () => ({ default: posthog }));
vi.mock('./analytics-config.js', () => ({ resolvePosthogToken }));

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
  resolvePosthogToken.mockReturnValue('phc_test');
  posthog.init.mockImplementation((_token, config) => config.loaded(posthog));
});

describe('analytics event registry', () => {
  test('exposes the complete custom-event catalog', () => {
    expectTypeOf<AnalyticsEventName>().toEqualTypeOf<
      | 'range_card_clicked'
      | 'cta_clicked'
      | 'catalog_filter_changed'
      | 'product_card_clicked'
      | 'product_viewed'
      | 'catalog_viewed'
      | 'product_shared'
      | 'brochure_downloaded'
      | 'contact_form_started'
      | 'contact_submitted'
      | 'contact_submit_blocked'
      | 'contact_submit_failed'
      | 'social_link_clicked'
      | 'email_linked_clicked'
      | 'phone_link_clicked'
      | 'language_switched'
    >();
  });

  test('associates each event name with its required properties', () => {
    expectTypeOf<AnalyticsEventProperties<'product_viewed'>>().toEqualTypeOf<{
      modelCode: string;
      range: string;
      variant: string | null;
      metaEventId: string;
    }>();
    expectTypeOf<AnalyticsEventProperties<'catalog_viewed'>>().toEqualTypeOf<{
      range: string | null;
      variant: string | null;
      metaEventId: string;
    }>();
    expectTypeOf<AnalyticsEventProperties<'catalog_filter_changed'>>().toEqualTypeOf<{
      range: string | null;
      variant: string | null;
      previousRange: string | null;
      previousVariant: string | null;
    }>();
    expectTypeOf<AnalyticsEventProperties<'product_shared'>>().toEqualTypeOf<{
      modelCode: string;
      method: 'native' | 'clipboard';
    }>();
    expectTypeOf<AnalyticsEventProperties<'social_link_clicked'>>().toEqualTypeOf<{
      platform: 'facebook' | 'instagram' | 'whatsapp';
      placement: 'footer' | 'contact_page';
    }>();
    expectTypeOf<AnalyticsEventProperties<'contact_submitted'>>().toEqualTypeOf<{
      equipment: string;
      metaEventId: string;
    }>();
    expectTypeOf<AnalyticsEventProperties<'email_linked_clicked'>>().toEqualTypeOf<{
      placement: 'contact_page';
    }>();
  });
});

// Module resets and dynamic imports can contend with other packages during the workspace-wide test run.
describe('analytics delivery', { timeout: 15_000 }, () => {
  test('uses beacon transport for events attached to outbound navigation', async () => {
    const { captureEventForNavigation, initAnalytics } = await import('./analytics.js');
    initAnalytics('en');

    captureEventForNavigation('phone_link_clicked', { placement: 'footer' });

    expect(posthog.capture).toHaveBeenCalledWith(
      'phone_link_clicked',
      { placement: 'footer' },
      { send_instantly: true, transport: 'sendBeacon' },
    );
  });

  // The deferral leaves a window between hydration and the idle callback. A navigation inside that window
  // must start PostHog while the landing URL is still current, or PostHog's first pageview reports the
  // destination and the landing page is never recorded — see the `onBeforeNavigate` subscription in
  // __root.tsx, which calls initAnalytics for exactly this reason.
  test('starts on demand before the idle callback, and only once', async () => {
    const { initAnalytics, initAnalyticsWhenIdle } = await import('./analytics.js');
    const cancel = initAnalyticsWhenIdle('en');

    expect(posthog.init).not.toHaveBeenCalled();

    // Stands in for the router's onBeforeNavigate firing first.
    initAnalytics('en');
    expect(posthog.init).toHaveBeenCalledTimes(1);

    // The idle callback still runs afterwards; it must not start a second client.
    initAnalytics('en');
    expect(posthog.init).toHaveBeenCalledTimes(1);

    cancel();
  });

  // Without this, an interaction inside the deferral window finds no language recorded yet and drops the
  // event instead of starting the SDK.
  test('captures an event that beats the idle callback', async () => {
    const { captureEvent, initAnalyticsWhenIdle } = await import('./analytics.js');
    const cancel = initAnalyticsWhenIdle('en');

    captureEvent('brochure_downloaded', { modelCode: 'JM-2400' });

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith('brochure_downloaded', { modelCode: 'JM-2400' });

    cancel();
  });

  test('does not initialise or capture when the PostHog token is unset', async () => {
    resolvePosthogToken.mockReturnValue(null);
    const { captureEvent, initAnalytics } = await import('./analytics.js');

    initAnalytics('en');
    captureEvent('brochure_downloaded', { modelCode: 'JM-2400' });

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  test('does not start PostHog for a persisted internal user', async () => {
    window.localStorage.setItem('is_internal', 'true');
    const { captureEvent, initAnalytics } = await import('./analytics.js');

    initAnalytics('en');
    captureEvent('brochure_downloaded', { modelCode: 'JM-2400' });

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  test('opts a running client out and back in when internal status changes', async () => {
    const { captureEvent, initAnalytics, setInternalUser } = await import('./analytics.js');
    initAnalytics('en');

    expect(setInternalUser(true)).toBe(true);
    expect(window.localStorage.getItem('is_internal')).toBe('true');
    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();

    captureEvent('brochure_downloaded', { modelCode: 'JM-2400' });
    expect(posthog.capture).not.toHaveBeenCalled();

    expect(setInternalUser(false)).toBe(false);
    expect(window.localStorage.getItem('is_internal')).toBeNull();
    expect(posthog.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });

    captureEvent('brochure_downloaded', { modelCode: 'JM-2400' });
    expect(posthog.capture).toHaveBeenCalledWith('brochure_downloaded', { modelCode: 'JM-2400' });
  });
});

// These calls are compiled by `pnpm typecheck`; they deliberately exercise the public typed capture seam.
function typecheckCaptureEventContract() {
  const captureEvent = null as unknown as typeof CaptureEvent;

  captureEvent('brochure_downloaded', { modelCode: 'JM-2400' });
  captureEvent('product_shared', { modelCode: 'JM-2400', method: 'clipboard' });
  captureEvent('language_switched', { fromLocale: 'en', toLocale: 'af', placement: 'nav' });

  // @ts-expect-error brochure downloads require the Product model code
  captureEvent('brochure_downloaded', {});
  // @ts-expect-error event names outside the registry are rejected
  captureEvent('unknown_event', {});
}

void typecheckCaptureEventContract;
