import { describe, expect, it } from 'vitest';

import {
  getUnitListPresentation,
  isUnitBuildStateFilter,
  isUnitSort,
  UNIT_BUILD_STATE_OPTIONS,
} from './unit-presentation';

describe('Unit list presentation', () => {
  it('maps the unfiltered serial sort to server input', () => {
    expect(getUnitListPresentation('all', 'serial')).toEqual({
      columnFilters: {},
      sortBy: 'productSerialNumber',
      sortDirection: 'asc',
    });
  });

  it('maps a build state and the Product name sort to server input', () => {
    expect(getUnitListPresentation('complete', 'product')).toEqual({
      columnFilters: { buildState: 'complete' },
      sortBy: 'productName',
      sortDirection: 'asc',
    });
  });
});

describe('persisted Unit controls', () => {
  it('accepts only known build state filters', () => {
    expect(isUnitBuildStateFilter('all')).toBe(true);
    expect(isUnitBuildStateFilter('in-build')).toBe(true);
    expect(isUnitBuildStateFilter('on-hand')).toBe(true);
    expect(isUnitBuildStateFilter('complete')).toBe(true);
    expect(isUnitBuildStateFilter('stock')).toBe(false);
    expect(isUnitBuildStateFilter(null)).toBe(false);
  });

  it('accepts only known sort values', () => {
    expect(isUnitSort('serial')).toBe(true);
    expect(isUnitSort('product')).toBe(true);
    expect(isUnitSort('productName')).toBe(false);
    expect(isUnitSort(null)).toBe(false);
  });
});

describe('Unit build state options', () => {
  it('offers every state the list displays, led by the unfiltered choice', () => {
    expect(UNIT_BUILD_STATE_OPTIONS).toEqual([
      { label: 'All build states', value: 'all' },
      { label: 'In build', value: 'in-build' },
      { label: 'On hand', value: 'on-hand' },
      { label: 'Complete', value: 'complete' },
    ]);
  });
});
