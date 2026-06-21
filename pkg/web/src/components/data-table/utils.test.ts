import { describe, expect, it } from 'vitest';

import { hasActiveFilterValue } from './utils.js';

describe('data table filter value helpers', () => {
  it('treats empty filter values as inactive', () => {
    expect(hasActiveFilterValue(undefined)).toBe(false);
    expect(hasActiveFilterValue(null)).toBe(false);
    expect(hasActiveFilterValue('')).toBe(false);
    expect(hasActiveFilterValue([])).toBe(false);
    expect(hasActiveFilterValue({ end: '', start: '' })).toBe(false);
  });

  it('treats non-empty filter values as active', () => {
    expect(hasActiveFilterValue('steel')).toBe(true);
    expect(hasActiveFilterValue(['draft'])).toBe(true);
    expect(hasActiveFilterValue({ end: '', start: '2026-06-21' })).toBe(true);
  });
});
