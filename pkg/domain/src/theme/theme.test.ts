import { describe, expect, it } from 'vitest';

import { JEDIDIAH_BRAND_YELLOW, JEDIDIAH_BRAND_YELLOW_ON_LIGHT } from '../brand.js';
import {
  DAYS_LEFT_SOON,
  DAYS_LEFT_URGENT,
  darkStatusColors,
  darkTheme,
  hexToRgbTriplet,
  lightStatusColors,
  lightTheme,
  restingStatusColor,
  statusDaysLeftColor,
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

describe('statusDaysLeftColor', () => {
  it('is urgent (red) at or below two days, whatever the status', () => {
    expect(statusDaysLeftColor({ status: 'in-progress', daysLeft: 0, scheme: 'dark' })).toBe(DAYS_LEFT_URGENT);
    expect(statusDaysLeftColor({ status: 'scheduled', daysLeft: 2, scheme: 'dark' })).toBe(DAYS_LEFT_URGENT);
  });

  it('is soon (amber) between three and five days, whatever the status', () => {
    expect(statusDaysLeftColor({ status: 'in-progress', daysLeft: 3, scheme: 'dark' })).toBe(DAYS_LEFT_SOON);
    expect(statusDaysLeftColor({ status: 'scheduled', daysLeft: 5, scheme: 'light' })).toBe(DAYS_LEFT_SOON);
  });

  it('is the in-progress blue beyond five days, per scheme', () => {
    expect(statusDaysLeftColor({ status: 'in-progress', daysLeft: 6, scheme: 'light' })).toBe('#3b82f6');
    expect(statusDaysLeftColor({ status: 'in-progress', daysLeft: 42, scheme: 'dark' })).toBe('#60a5fa');
  });

  it('is the scheduled green beyond five days', () => {
    expect(statusDaysLeftColor({ status: 'scheduled', daysLeft: 6, scheme: 'dark' })).toBe('#22c55e');
    expect(statusDaysLeftColor({ status: 'scheduled', daysLeft: 42, scheme: 'light' })).toBe('#22c55e');
  });
});

describe('restingStatusColor', () => {
  it('is the in-progress blue per scheme, ignoring urgency', () => {
    expect(restingStatusColor('in-progress', 'light')).toBe('#3b82f6');
    expect(restingStatusColor('in-progress', 'dark')).toBe('#60a5fa');
  });

  it('is the scheduled green, the resting accent for a Job with no countdown', () => {
    expect(restingStatusColor('scheduled', 'light')).toBe('#22c55e');
    expect(restingStatusColor('scheduled', 'dark')).toBe('#22c55e');
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
