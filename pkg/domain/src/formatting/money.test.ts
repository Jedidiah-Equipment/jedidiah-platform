import { describe, expect, it } from 'vitest';

import { roundToCents } from './money.js';

describe('roundToCents', () => {
  it('rounds a half cent up even where the float product falls a hair short', () => {
    expect(10.075 * 100).toBeLessThan(1007.5);
    expect(roundToCents(10.075)).toBe(10.08);
  });

  it('keeps an amount already in cents', () => {
    expect(roundToCents(1133.49)).toBe(1133.49);
    expect(roundToCents(0)).toBe(0);
  });
});
