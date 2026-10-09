import { describe, expect, it } from 'vitest';
import { isPickedExactly, readDateOnlyRangeFilter, togglePick } from './column-filter-values.js';

const status = (value: unknown) => [{ id: 'status', value }];

describe('isPickedExactly', () => {
  it('holds only while the filter has these values and no others', () => {
    expect(isPickedExactly(status(['open']), 'status', ['open'])).toBe(true);
    expect(isPickedExactly(status(['open', 'solved']), 'status', ['solved', 'open'])).toBe(true);
    expect(isPickedExactly(status(['open', 'solved']), 'status', ['open'])).toBe(false);
    expect(isPickedExactly([], 'status', ['open'])).toBe(false);
  });
});

describe('readDateOnlyRangeFilter', () => {
  it('names each valid end after the list input field and leaves an invalid or missing end out', () => {
    const range = [{ id: 'reportedAt', value: { start: '2026-10-01', end: 'soon' } }];
    expect(readDateOnlyRangeFilter(range, 'reportedAt', ['reportedFrom', 'reportedTo'])).toEqual({
      reportedFrom: '2026-10-01',
    });
    expect(readDateOnlyRangeFilter([], 'reportedAt', ['reportedFrom', 'reportedTo'])).toEqual({});
  });
});

describe('togglePick', () => {
  it('picks exactly the values, keeping other filters, and clears the pick when toggled again', () => {
    const picked = togglePick([{ id: 'other', value: 'x' }, ...status(['solved'])], 'status', ['open']);
    expect(picked).toEqual([{ id: 'other', value: 'x' }, ...status(['open'])]);
    expect(togglePick(picked, 'status', ['open'])).toEqual([{ id: 'other', value: 'x' }]);
  });
});
