import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAppEnv } from './app-env';

const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;

afterEach(() => {
  vi.resetModules();
  if (originalAppEnv === undefined) {
    delete process.env.EXPO_PUBLIC_APP_ENV;
  } else {
    process.env.EXPO_PUBLIC_APP_ENV = originalAppEnv;
  }
});

async function loadAppEnv(rawValue: string | undefined) {
  vi.resetModules();
  if (rawValue === undefined) {
    delete process.env.EXPO_PUBLIC_APP_ENV;
  } else {
    process.env.EXPO_PUBLIC_APP_ENV = rawValue;
  }

  return import('./app-env');
}

describe('resolveAppEnv', () => {
  it('defaults missing and unrecognised values to development', () => {
    expect(resolveAppEnv(undefined)).toBe('development');
    expect(resolveAppEnv('local')).toBe('development');
  });

  it('accepts staging and production runtime environments', () => {
    expect(resolveAppEnv('staging')).toBe('staging');
    expect(resolveAppEnv('production')).toBe('production');
  });
});

describe('appEnv', () => {
  it.each([
    [undefined, 'development', false],
    ['staging', 'staging', true],
    ['production', 'production', false],
    ['garbage', 'development', false],
  ] as const)('resolves %s to %s', async (rawValue, expectedAppEnv, expectedIsStaging) => {
    const { appEnv, isStagingAppEnv } = await loadAppEnv(rawValue);

    expect(appEnv).toBe(expectedAppEnv);
    expect(isStagingAppEnv).toBe(expectedIsStaging);
  });
});
