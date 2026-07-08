import { describe, expect, it } from 'vitest';

import { isPostHogEnabled, isPostHogSourceMapsEnabled } from './client-config.js';

describe('PostHog config helpers', () => {
  it('keeps PostHog disabled in remote environments when the project token is unset', () => {
    expect(isPostHogEnabled({ APP_ENV: 'production' })).toBe(false);
  });

  it('enables PostHog in remote environments when the project token is configured', () => {
    expect(isPostHogEnabled({ APP_ENV: 'staging', POSTHOG_PROJECT_TOKEN: 'phc_test' })).toBe(true);
  });

  it('keeps source maps disabled until both upload credentials are configured', () => {
    expect(
      isPostHogSourceMapsEnabled({
        APP_ENV: 'production',
        POSTHOG_PROJECT_TOKEN: 'phc_test',
        POSTHOG_API_KEY: 'phx_test',
      }),
    ).toBe(false);
  });

  it('enables source maps in remote environments when both upload credentials are configured', () => {
    expect(
      isPostHogSourceMapsEnabled({
        APP_ENV: 'production',
        POSTHOG_PROJECT_TOKEN: 'phc_test',
        POSTHOG_API_KEY: 'phx_test',
        POSTHOG_PROJECT_ID: '123',
      }),
    ).toBe(true);
  });
});
