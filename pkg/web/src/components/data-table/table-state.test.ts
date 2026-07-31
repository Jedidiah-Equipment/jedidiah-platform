import type { SortingState } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { constrainSorting, getPrimarySort } from './table-state.js';

const TestSortBy = z.enum(['name', 'email', 'role']);

const sortOptions = {
  allowedSortIds: TestSortBy.options,
  defaultSort: {
    id: 'email',
  },
} as const;

describe('data table state helpers', () => {
  it('preserves allowed primary sort ids and direction', () => {
    const sorting: SortingState = [{ id: 'role', desc: true }];

    expect(getPrimarySort(sorting, sortOptions)).toEqual({
      id: 'role',
      desc: true,
    });
    expect(constrainSorting(sorting, sortOptions)).toEqual([{ id: 'role', desc: true }]);
  });

  it('falls back to the default sort for missing or disallowed ids', () => {
    expect(constrainSorting([], sortOptions)).toEqual([{ id: 'email', desc: false }]);
    expect(constrainSorting([{ id: 'createdAt', desc: true }], sortOptions)).toEqual([{ id: 'email', desc: false }]);
  });
});
