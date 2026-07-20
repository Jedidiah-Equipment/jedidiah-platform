// @vitest-environment jsdom

import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';

import type { AnalyticsEventName, AnalyticsEventProperties, captureEvent as CaptureEvent } from './analytics.js';

const posthog = vi.hoisted(() => ({
  capture: vi.fn(),
  init: vi.fn(),
  register: vi.fn(),
  setPersonProperties: vi.fn(),
}));
const resolvePosthogToken = vi.hoisted(() => vi.fn());

vi.mock('posthog-js', () => ({ default: posthog }));
vi.mock('./analytics-config.js', () => ({ resolvePosthogToken }));

beforeEach(() => {
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
      | 'product_shared'
      | 'brochure_downloaded'
      | 'contact_submitted'
      | 'contact_submit_failed'
      | 'social_link_clicked'
      | 'phone_link_clicked'
      | 'language_switched'
    >();
  });

  test('associates each event name with its required properties', () => {
    expectTypeOf<AnalyticsEventProperties<'product_viewed'>>().toEqualTypeOf<{
      modelCode: string;
      range: string;
      variant: string | null;
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

  test('does not initialise or capture when the PostHog token is unset', async () => {
    resolvePosthogToken.mockReturnValue(null);
    const { captureEvent, initAnalytics } = await import('./analytics.js');

    initAnalytics('en');
    captureEvent('brochure_downloaded', { modelCode: 'JM-2400' });

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
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
