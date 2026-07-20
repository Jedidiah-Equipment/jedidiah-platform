import { describe, expect, it } from 'vitest';

import { JEDIDIAH_BRAND_YELLOW, JEDIDIAH_BRAND_YELLOW_ON_LIGHT } from '../brand.js';
import {
  darkStatusColors,
  darkTheme,
  hexToRgbTriplet,
  jobStatusAccentColor,
  lightStatusColors,
  lightTheme,
  resolveJobStatusTone,
  themes,
} from './index.js';

describe('theme tokens', () => {
  it('reuses the brand yellow for the primary colour', () => {
    expect(lightTheme.colors.primary).toBe(JEDIDIAH_BRAND_YELLOW_ON_LIGHT);
    expect(darkTheme.colors.primary).toBe(JEDIDIAH_BRAND_YELLOW);
  });

  it('puts near-black on the primary colour', () => {
    expect(lightTheme.colors.primaryForeground).toBe('#0a0a0a');
    expect(darkTheme.colors.primaryForeground).toBe('#0a0a0a');
  });

  it('reproduces the dark mockup neutral palette', () => {
    expect(darkTheme.colors.background).toBe('#0a0a0b');
    expect(darkTheme.colors.surface).toBe('#141416');
    expect(darkTheme.colors.foreground).toBe('#fafafa');
  });

  it('exposes the in-progress status accent per scheme', () => {
    expect(lightTheme.status.inProgress).toBe('#3b82f6');
    expect(darkTheme.status.inProgress).toBe('#60a5fa');
  });

  it('keys both themes by scheme', () => {
    expect(themes.light).toBe(lightTheme);
    expect(themes.dark).toBe(darkTheme);
  });
});

describe('jobStatusAccentColor', () => {
  it('maps the canonical Job tones to blue, green, and theme-neutral', () => {
    expect(jobStatusAccentColor('in-progress', 'light')).toBe('#3b82f6');
    expect(jobStatusAccentColor('in-progress', 'dark')).toBe('#60a5fa');
    expect(jobStatusAccentColor('next', 'light')).toBe('#22c55e');
    expect(jobStatusAccentColor('next', 'dark')).toBe('#22c55e');
    expect(jobStatusAccentColor('muted', 'light')).toBe('#737373');
    expect(jobStatusAccentColor('muted', 'dark')).toBe('#7a7a82');
  });

  it('prioritises in-progress, then next, then neutral', () => {
    expect(resolveJobStatusTone({ isNext: true, status: 'in-progress' })).toBe('in-progress');
    expect(resolveJobStatusTone({ isNext: true, status: 'scheduled' })).toBe('next');
    expect(resolveJobStatusTone({ isNext: false, status: 'scheduled' })).toBe('muted');
  });
});

describe('hexToRgbTriplet', () => {
  it('converts a hex colour to the space-separated CSS-var triplet', () => {
    expect(hexToRgbTriplet('#60a5fa')).toBe('96 165 250');
    expect(hexToRgbTriplet('#000000')).toBe('0 0 0');
    expect(hexToRgbTriplet('#ffffff')).toBe('255 255 255');
  });

  it('reproduces the mobile status CSS-var values from the hex palette (no chip drift)', () => {
    // Guards the gluestack-config derivation: these must equal the triplets the chips render today.
    expect(hexToRgbTriplet(darkStatusColors.inProgress)).toBe('96 165 250');
    expect(hexToRgbTriplet(lightStatusColors.inProgress)).toBe('59 130 246');
    expect(hexToRgbTriplet(darkStatusColors.next)).toBe('34 197 94');
    expect(hexToRgbTriplet(darkStatusColors.nextSoft)).toBe('95 207 135');
    expect(hexToRgbTriplet(darkStatusColors.scheduled)).toBe('251 191 36');
  });
});
