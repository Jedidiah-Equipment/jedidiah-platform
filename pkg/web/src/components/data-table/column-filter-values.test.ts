import { describe, expect, it } from 'vitest';
import { isPickedExactly, togglePick } from './column-filter-values.js';

const status = (value: unknown) => [{ id: 'status', value }];

describe('isPickedExactly', () => {
  it('holds only while the filter has these values and no others', () => {
    expect(isPickedExactly(status(['open']), 'status', ['open'])).toBe(true);
    expect(isPickedExactly(status(['open', 'solved']), 'status', ['solved', 'open'])).toBe(true);
    expect(isPickedExactly(status(['open', 'solved']), 'status', ['open'])).toBe(false);
    expect(isPickedExactly([], 'status', ['open'])).toBe(false);
  });
});

describe('togglePick', () => {
  it('picks exactly the values, keeping other filters, and clears the pick when toggled again', () => {
    const picked = togglePick([{ id: 'other', value: 'x' }, ...status(['solved'])], 'status', ['open']);
    expect(picked).toEqual([{ id: 'other', value: 'x' }, ...status(['open'])]);
    expect(togglePick(picked, 'status', ['open'])).toEqual([{ id: 'other', value: 'x' }]);
  });
});
