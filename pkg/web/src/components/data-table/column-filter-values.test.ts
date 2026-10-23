import { describe, expect, it } from 'vitest';
import { isPickedExactly, isWithinDateRange, readDateOnlyRangeFilter, togglePick } from './column-filter-values.js';

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

describe('isWithinDateRange', () => {
  it('keeps plant dates and instants on the South African calendar days between the ends, both inclusive', () => {
    const october = { start: '2026-10-01', end: '2026-10-31' };
    expect(isWithinDateRange('2026-10-01', october)).toBe(true);
    expect(isWithinDateRange('2026-10-31', october)).toBe(true);
    expect(isWithinDateRange('2026-11-01', october)).toBe(false);
    // 23:30 UTC on 30 September is already 1 October in Johannesburg.
    expect(isWithinDateRange('2026-09-30T23:30:00.000Z', october)).toBe(true);
    expect(isWithinDateRange('2026-10-31T22:30:00.000Z', october)).toBe(false);
  });

  it('keeps everything without ends, and leaves an open end open', () => {
    expect(isWithinDateRange('2020-01-01', undefined)).toBe(true);
    expect(isWithinDateRange('2020-01-01', { end: '2026-10-01' })).toBe(true);
    expect(isWithinDateRange('2020-01-01', { start: '2026-10-01' })).toBe(false);
    expect(isWithinDateRange(null, { start: '2026-10-01' })).toBe(false);
  });
});

describe('togglePick', () => {
  it('picks exactly the values, keeping other filters, and clears the pick when toggled again', () => {
    const picked = togglePick([{ id: 'other', value: 'x' }, ...status(['solved'])], 'status', ['open']);
    expect(picked).toEqual([{ id: 'other', value: 'x' }, ...status(['open'])]);
    expect(togglePick(picked, 'status', ['open'])).toEqual([{ id: 'other', value: 'x' }]);
    expect(togglePick(picked, 'status', [])).toEqual([{ id: 'other', value: 'x' }]);
  });
});
