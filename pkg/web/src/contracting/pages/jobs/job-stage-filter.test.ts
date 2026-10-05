import { jobQueues } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import {
  isOnlyStage,
  isPickedStages,
  listedStages,
  quickFilterStages,
  stagesCount,
  toggleQuickFilter,
  toggleStages,
} from './job-stage-filter.js';

const stage = (value: unknown) => [{ id: 'stage', value }];

describe('listedStages', () => {
  it('lists every open stage until one is picked', () => {
    expect(listedStages([])).toEqual(['upcoming', 'active', 'looks-finished', 'awaiting-pricing', 'awaiting-invoice']);
    expect(listedStages(stage([]))).toHaveLength(5);
  });

  it('lists the picked stages in queue order and ignores unknown values', () => {
    expect(listedStages(stage(['cancelled', 'bogus', 'upcoming']))).toEqual(['upcoming', 'cancelled']);
  });
});

describe('quickFilterStages', () => {
  it('offers open stages holding a Job, never Invoiced or Cancelled', () => {
    const counts = {
      upcoming: 2,
      active: 0,
      'looks-finished': 1,
      'awaiting-pricing': 0,
      'awaiting-invoice': 0,
      invoiced: 9,
      cancelled: 3,
    };
    expect(quickFilterStages(counts)).toEqual(['upcoming', 'looks-finished']);
    expect(quickFilterStages(undefined)).toEqual([]);
  });

  it('keeps the quick filter of a stage picked on its own after it empties', () => {
    expect(quickFilterStages(undefined, stage(['awaiting-pricing']))).toEqual(['awaiting-pricing']);
  });
});

describe('toggleQuickFilter', () => {
  it('shows just the pressed stage, keeping other filters', () => {
    const next = toggleQuickFilter([{ id: 'other', value: 'x' }, ...stage(['upcoming', 'active'])], 'active');
    expect(next).toEqual([{ id: 'other', value: 'x' }, ...stage(['active'])]);
    expect(isOnlyStage(next, 'active')).toBe(true);
  });

  it('clears back to every open stage when pressed again', () => {
    expect(toggleQuickFilter(stage(['active']), 'active')).toEqual([]);
  });
});

describe('toggleStages', () => {
  it('picks every stage for All, Invoiced and Cancelled included, then clears back to the defaults', () => {
    const every = toggleStages([{ id: 'other', value: 'x' }, ...stage(['active'])], jobQueues);
    expect(isPickedStages(every, jobQueues)).toBe(true);
    expect(listedStages(every)).toHaveLength(7);
    expect(every).toContainEqual({ id: 'other', value: 'x' });
    expect(toggleStages(every, jobQueues)).toEqual([{ id: 'other', value: 'x' }]);
  });

  it('lists the page defaults when nothing is picked', () => {
    expect(listedStages([], ['awaiting-invoice'])).toEqual(['awaiting-invoice']);
  });

  it('counts the Jobs across the given stages', () => {
    const counts = {
      upcoming: 1,
      active: 2,
      'looks-finished': 0,
      'awaiting-pricing': 0,
      'awaiting-invoice': 3,
      invoiced: 4,
      cancelled: 1,
    };
    expect(stagesCount(counts)).toBe(11);
    expect(stagesCount(counts, ['awaiting-invoice', 'invoiced'])).toBe(7);
    expect(stagesCount(undefined)).toBe(0);
  });
});
