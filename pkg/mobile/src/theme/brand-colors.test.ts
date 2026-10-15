import { lightColors } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import {
  resolveAccentActionColor,
  resolveBrandForegroundColors,
  resolveLoadingSpinnerColor,
  resolvePrimaryColorTriplets,
} from './brand-palette';

describe('resolvePrimaryColorTriplets', () => {
  it('paints the shared primary colors outside staging', () => {
    expect(resolvePrimaryColorTriplets(false)).toEqual({
      light: '184 150 0',
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

describe('resolveAccentActionColor', () => {
  it('uses the light primary as the production accent and darkens staging pink', () => {
    expect(resolveAccentActionColor(false)).toBe(lightColors.primary);
    expect(resolveAccentActionColor(true)).toBe('#9d174d');
  });
});

describe('resolveBrandForegroundColors', () => {
  it('paints the brand primary on dark surfaces and the darkened accent on light ones', () => {
    expect(resolveBrandForegroundColors(false)).toEqual({ dark: '#fff000', light: lightColors.primary });
    expect(resolveBrandForegroundColors(true)).toEqual({ dark: '#ff6bbf', light: '#9d174d' });
  });
});
