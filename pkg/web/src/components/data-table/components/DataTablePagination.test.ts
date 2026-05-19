import { describe, expect, it } from 'vitest';

import { getPaginationItems } from './DataTablePagination.js';

describe('getPaginationItems', () => {
  it('returns every page for short pagination ranges', () => {
    expect(getPaginationItems(1, 1)).toEqual([1]);
    expect(getPaginationItems(2, 3)).toEqual([1, 2, 3]);
  });

  it('shows leading pages and trailing ellipsis near the start', () => {
    expect(getPaginationItems(2, 10)).toEqual([1, 2, 3, 'ellipsis']);
  });

  it('shows surrounding pages between ellipses in the middle', () => {
    expect(getPaginationItems(5, 10)).toEqual(['ellipsis', 4, 5, 6, 'ellipsis']);
  });

  it('shows leading ellipsis and trailing pages near the end', () => {
    expect(getPaginationItems(9, 10)).toEqual(['ellipsis', 8, 9, 10]);
  });
});
