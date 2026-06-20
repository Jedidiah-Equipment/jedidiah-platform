import { describe, expect, it } from 'vitest';

import { JEDIDIAH_BRAND_YELLOW, JEDIDIAH_BRAND_YELLOW_ON_LIGHT } from '../brand.js';
import {
  DAYS_LEFT_OK,
  DAYS_LEFT_SOON,
  DAYS_LEFT_URGENT,
  darkTheme,
  daysLeftColor,
  lightTheme,
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

describe('daysLeftColor', () => {
  it('is urgent (red) at or below two days', () => {
    expect(daysLeftColor(0)).toBe(DAYS_LEFT_URGENT);
    expect(daysLeftColor(2)).toBe(DAYS_LEFT_URGENT);
  });

  it('is soon (amber) between three and five days', () => {
    expect(daysLeftColor(3)).toBe(DAYS_LEFT_SOON);
    expect(daysLeftColor(5)).toBe(DAYS_LEFT_SOON);
  });

  it('is ok (green) beyond five days', () => {
    expect(daysLeftColor(6)).toBe(DAYS_LEFT_OK);
    expect(daysLeftColor(42)).toBe(DAYS_LEFT_OK);
  });
});
