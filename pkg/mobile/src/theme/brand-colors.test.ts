import { describe, expect, it } from 'vitest';

import { resolveLoadingSpinnerColor, resolvePrimaryColorTriplets } from './brand-palette';

describe('resolvePrimaryColorTriplets', () => {
  it('keeps the current yellow primary colors outside staging', () => {
    expect(resolvePrimaryColorTriplets(false)).toEqual({
      light: '248 211 0',
      dark: '255 240 0',
    });
  });

  it('uses pink primary colors on staging', () => {
    expect(resolvePrimaryColorTriplets(true)).toEqual({
      light: '236 72 153',
      dark: '255 107 191',
    });
  });
});

describe('resolveLoadingSpinnerColor', () => {
  it('follows the dark primary color for the loading spinner', () => {
    expect(resolveLoadingSpinnerColor(false)).toBe('#fff000');
    expect(resolveLoadingSpinnerColor(true)).toBe('#ff6bbf');
  });
});
