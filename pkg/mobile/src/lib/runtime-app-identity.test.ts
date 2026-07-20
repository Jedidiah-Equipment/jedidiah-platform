import { describe, expect, it } from 'vitest';

import { isStagingRuntimeApp, resolveRuntimeScheme } from './runtime-app-identity';

describe('resolveRuntimeScheme', () => {
  it('uses the staging scheme from the Expo config', () => {
    expect(resolveRuntimeScheme({ scheme: 'jedidiahopsstaging' })).toBe('jedidiahopsstaging');
  });

  it('uses the first configured scheme when Expo provides an array', () => {
    expect(resolveRuntimeScheme({ scheme: ['jedidiahopsstaging', 'za.co.jedidiahequipment.ops.staging'] })).toBe(
      'jedidiahopsstaging',
    );
  });

  it('falls back to the production scheme when the runtime config is unavailable', () => {
    expect(resolveRuntimeScheme(null)).toBe('jedidiahops');
    expect(resolveRuntimeScheme({})).toBe('jedidiahops');
  });

  it('identifies the staging build from its Expo scheme', () => {
    expect(isStagingRuntimeApp({ scheme: 'jedidiahopsstaging' })).toBe(true);
    expect(isStagingRuntimeApp({ scheme: 'jedidiahops' })).toBe(false);
    expect(isStagingRuntimeApp(null)).toBe(false);
  });
});
