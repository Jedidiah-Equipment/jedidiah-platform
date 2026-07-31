import { describe, expect, it } from 'vitest';

import { CursorQueryInput, getNextCursor } from './pagination.js';

describe('CursorQueryInput', () => {
  it('accepts an initial null cursor from an infinite query', () => {
    expect(CursorQueryInput.parse({ cursor: null, limit: 25 })).toEqual({ cursor: 0, limit: 25 });
  });

  it('preserves the fetch-all limit sentinel', () => {
    expect(CursorQueryInput.parse({ limit: 0 })).toEqual({ cursor: 0, limit: 0 });
  });
});

describe('getNextCursor', () => {
  it('advances by the number of returned items while rows remain', () => {
    expect(getNextCursor({ count: 25, cursor: 25, total: 75 })).toBe(50);
  });

  it('stops at the end and for stale cursors that return no items', () => {
    expect(getNextCursor({ count: 25, cursor: 50, total: 75 })).toBeNull();
    expect(getNextCursor({ count: 0, cursor: 100, total: 75 })).toBeNull();
  });
});
