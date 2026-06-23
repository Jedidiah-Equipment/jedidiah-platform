import { describe, expect, test } from 'vitest';

import { resolvePosthogToken } from './analytics-config.js';

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
