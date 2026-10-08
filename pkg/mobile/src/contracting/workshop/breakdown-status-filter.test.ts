import { describe, expect, it } from 'vitest';
import { isStatusFilter, statusesFor, statusOptions } from './breakdown-status-filter';

describe('breakdown status filter', () => {
  it('lists the unsolved statuses by default and every status for All', () => {
    expect(statusesFor('unsolved')).toEqual(['open', 'in-progress']);
    expect(statusesFor('all')).toEqual(['open', 'in-progress', 'solved']);
    expect(statusesFor('solved')).toEqual(['solved']);
    expect(isStatusFilter('bogus')).toBe(false);
  });

  it('counts each option once the counts load', () => {
    expect(statusOptions({ open: 2, 'in-progress': 1, solved: 5 }).map((option) => option.label)).toEqual([
      'Not fixed or Fixing (3)',
      'Not fixed (2)',
      'Fixing (1)',
      'Fixed (5)',
      'All (8)',
    ]);
    expect(statusOptions(undefined)[0]?.label).toBe('Not fixed or Fixing');
  });
});
