import { describe, expect, it } from 'vitest';

import { resolveColorModePreference } from './color-mode';

describe('resolveColorModePreference', () => {
  it('uses explicit light and dark preferences instead of the system scheme', () => {
    expect(resolveColorModePreference('light', 'dark')).toBe('light');
    expect(resolveColorModePreference('dark', 'light')).toBe('dark');
  });

  it('falls back to light when the system scheme is absent or unspecified', () => {
    expect(resolveColorModePreference('system', null)).toBe('light');
    expect(resolveColorModePreference('system', 'unspecified')).toBe('light');
  });

  it('follows the system scheme for system mode', () => {
    expect(resolveColorModePreference('system', 'dark')).toBe('dark');
    expect(resolveColorModePreference('system', 'light')).toBe('light');
  });
});
