import { describe, expect, it } from 'vitest';

import { parseColorModePreference, resolveColorModePreference } from './color-mode';

describe('resolveColorModePreference', () => {
  it('uses explicit light and dark preferences', () => {
    expect(resolveColorModePreference('light')).toBe('light');
    expect(resolveColorModePreference('dark')).toBe('dark');
  });
});

describe('parseColorModePreference', () => {
  it('accepts only explicit light and dark preferences', () => {
    expect(parseColorModePreference('light')).toBe('light');
    expect(parseColorModePreference('dark')).toBe('dark');
  });

  it('defaults missing, invalid, and legacy system values to dark', () => {
    expect(parseColorModePreference(null)).toBe('dark');
    expect(parseColorModePreference('system')).toBe('dark');
    expect(parseColorModePreference('unknown')).toBe('dark');
  });
});
