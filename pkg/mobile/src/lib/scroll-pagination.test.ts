import { describe, expect, it } from 'vitest';

import { isNearVerticalScrollEnd } from './scroll-pagination';

describe('isNearVerticalScrollEnd', () => {
  it('returns true inside the threshold', () => {
    expect(
      isNearVerticalScrollEnd({
        contentOffset: { y: 600 },
        contentSize: { height: 1_000 },
        layoutMeasurement: { height: 200 },
      }),
    ).toBe(true);
  });

  it('returns false outside the threshold', () => {
    expect(
      isNearVerticalScrollEnd({
        contentOffset: { y: 400 },
        contentSize: { height: 1_000 },
        layoutMeasurement: { height: 200 },
      }),
    ).toBe(false);
  });
});
