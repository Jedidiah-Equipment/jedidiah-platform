import { describe, expect, test } from 'vitest';

import { resolveMetaPixelId, resolvePosthogToken } from './analytics-config.js';

function env(values: Partial<ImportMetaEnv>): ImportMetaEnv {
  return values as ImportMetaEnv;
}

describe('resolvePosthogToken', () => {
  test('returns null when no token is configured so analytics stays off', () => {
    expect(resolvePosthogToken(env({}))).toBeNull();
  });

  test('returns null when the token is blank or whitespace', () => {
    expect(resolvePosthogToken(env({ VITE_POSTHOG_KEY: '   ' }))).toBeNull();
  });

  test('returns the trimmed token when set', () => {
    expect(resolvePosthogToken(env({ VITE_POSTHOG_KEY: '  phc_test  ' }))).toBe('phc_test');
  });
});

describe('resolveMetaPixelId', () => {
  test('returns null when no pixel is configured so Meta tracking stays off', () => {
    expect(resolveMetaPixelId(env({}))).toBeNull();
  });

  test('returns null when the pixel ID is blank or whitespace', () => {
    expect(resolveMetaPixelId(env({ VITE_META_PIXEL_ID: '   ' }))).toBeNull();
  });

  test('returns the trimmed pixel ID when set', () => {
    expect(resolveMetaPixelId(env({ VITE_META_PIXEL_ID: '  27975094252106874  ' }))).toBe('27975094252106874');
  });
});
