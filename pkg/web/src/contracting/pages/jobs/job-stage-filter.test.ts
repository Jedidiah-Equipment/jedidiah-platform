import { openJobQueues } from '@pkg/domain/contracting';
import { jobQueues } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { isPickedStages, listedStages, quickFilterStages, toggleStages } from './job-stage-filter.js';

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
  const counts = {
    upcoming: 2,
    active: 0,
    'looks-finished': 1,
    'awaiting-pricing': 0,
    'awaiting-invoice': 0,
    invoiced: 9,
    cancelled: 3,
  };

  it('offers the stages asked for that hold a Job', () => {
    expect(quickFilterStages(counts, [], openJobQueues)).toEqual(['upcoming', 'looks-finished']);
    expect(quickFilterStages(counts, [], ['awaiting-invoice'])).toEqual([]);
    expect(quickFilterStages(undefined, [], openJobQueues)).toEqual([]);
  });

  it('keeps the quick filter of a stage picked on its own after it empties', () => {
    expect(quickFilterStages(undefined, stage(['awaiting-pricing']), openJobQueues)).toEqual(['awaiting-pricing']);
  });
});

describe('toggleStages', () => {
  it('shows just the pressed stage, keeping other filters, and clears the pick when pressed again', () => {
    const next = toggleStages([{ id: 'other', value: 'x' }, ...stage(['upcoming', 'active'])], ['active']);
    expect(next).toEqual([{ id: 'other', value: 'x' }, ...stage(['active'])]);
    expect(isPickedStages(next, ['active'])).toBe(true);
    expect(toggleStages(next, ['active'])).toEqual([{ id: 'other', value: 'x' }]);
  });

  it('picks every stage for All, Invoiced and Cancelled included', () => {
    const every = toggleStages(stage(['active']), jobQueues);
    expect(every).toEqual(stage([...jobQueues]));
    expect(isPickedStages(every, jobQueues)).toBe(true);
    expect(isPickedStages(stage(['active']), jobQueues)).toBe(false);
  });
});
