import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAppEnv, resolveLanderOrigin } from './app-env';

const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;
const originalLanderOrigin = process.env.EXPO_PUBLIC_LANDER_ORIGIN;

afterEach(() => {
  vi.resetModules();
  if (originalAppEnv === undefined) {
    delete process.env.EXPO_PUBLIC_APP_ENV;
  } else {
    process.env.EXPO_PUBLIC_APP_ENV = originalAppEnv;
  }
  if (originalLanderOrigin === undefined) {
    delete process.env.EXPO_PUBLIC_LANDER_ORIGIN;
  } else {
    process.env.EXPO_PUBLIC_LANDER_ORIGIN = originalLanderOrigin;
  }
});

async function loadAppEnv(rawValue: string | undefined, rawLanderOrigin?: string) {
  vi.resetModules();
  if (rawValue === undefined) {
    delete process.env.EXPO_PUBLIC_APP_ENV;
  } else {
    process.env.EXPO_PUBLIC_APP_ENV = rawValue;
  }
  if (rawLanderOrigin === undefined) {
    delete process.env.EXPO_PUBLIC_LANDER_ORIGIN;
  } else {
    process.env.EXPO_PUBLIC_LANDER_ORIGIN = rawLanderOrigin;
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

describe('landerOrigin', () => {
  it('defaults to the slot-zero local Lander and removes trailing slashes from overrides', async () => {
    expect(resolveLanderOrigin(undefined)).toBe('http://localhost:7004');
    expect(resolveLanderOrigin('https://jedidiahequipment.co.za///')).toBe('https://jedidiahequipment.co.za');

    const { landerOrigin } = await loadAppEnv('staging', 'https://preview.example.com/');

    expect(landerOrigin).toBe('https://preview.example.com');
  });
});
