import type { UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  type BayScheduleFilter,
  countBayScheduleFilterMatches,
  emptyBayScheduleFilter,
  hasActiveBayScheduleFilter,
  slotMatchesBayScheduleFilter,
} from './bay-schedule-filter.js';

const id = (value: string) => value as UUID;

const bay1 = id('bay-1');
const bay2 = id('bay-2');
const job1 = id('job-1');
const job2 = id('job-2');

const customerA = id('customer-a');
const customerB = id('customer-b');

const jobsById = new Map([
  [job1, { customerId: customerA }],
  [job2, { customerId: customerB }],
]);

const filterWith = (overrides: Partial<BayScheduleFilter>): BayScheduleFilter => ({
  ...emptyBayScheduleFilter,
  ...overrides,
});

describe('hasActiveBayScheduleFilter', () => {
  it('is false for the empty filter', () => {
    expect(hasActiveBayScheduleFilter(emptyBayScheduleFilter)).toBe(false);
  });

  it('is true when any dimension is set', () => {
    expect(hasActiveBayScheduleFilter(filterWith({ bayId: bay1 }))).toBe(true);
    expect(hasActiveBayScheduleFilter(filterWith({ customerId: customerA }))).toBe(true);
    expect(hasActiveBayScheduleFilter(filterWith({ jobId: job1 }))).toBe(true);
  });
});

describe('slotMatchesBayScheduleFilter', () => {
  it('matches everything when no filter is active', () => {
    expect(
      slotMatchesBayScheduleFilter({
        bayId: bay1,
        filter: emptyBayScheduleFilter,
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(true);
  });

  it('matches the bay dimension against the slot owning bay', () => {
    const filter = filterWith({ bayId: bay1 });

    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: null } })).toBe(true);
    expect(slotMatchesBayScheduleFilter({ bayId: bay2, filter, jobsById, slot: { jobId: null } })).toBe(false);
  });

  it('matches the job dimension only for the booked job', () => {
    const filter = filterWith({ jobId: job1 });

    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job1 } })).toBe(true);
    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job2 } })).toBe(false);
  });

  it('excludes idle slots when a job or customer filter is active', () => {
    expect(
      slotMatchesBayScheduleFilter({
        bayId: bay1,
        filter: filterWith({ jobId: job1 }),
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(false);
    expect(
      slotMatchesBayScheduleFilter({
        bayId: bay1,
        filter: filterWith({ customerId: customerA }),
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(false);
  });

  it('matches the customer dimension through the booked job', () => {
    const filter = filterWith({ customerId: customerA });

    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job1 } })).toBe(true);
    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job2 } })).toBe(false);
    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: id('job-missing') } })).toBe(
      false,
    );
  });

  it('requires every active dimension to match', () => {
    const filter = filterWith({ bayId: bay1, customerId: customerA, jobId: job1 });

    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job1 } })).toBe(true);
    expect(slotMatchesBayScheduleFilter({ bayId: bay2, filter, jobsById, slot: { jobId: job1 } })).toBe(false);
    expect(slotMatchesBayScheduleFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job2 } })).toBe(false);
  });
});

describe('countBayScheduleFilterMatches', () => {
  const bays = [
    { id: bay1, slots: [{ jobId: job1 }, { jobId: null }] },
    { id: bay2, slots: [{ jobId: job2 }] },
  ];

  it('counts every slot for the empty filter', () => {
    expect(countBayScheduleFilterMatches({ bays, filter: emptyBayScheduleFilter, jobsById })).toBe(3);
  });

  it('counts only slots matching all active dimensions', () => {
    expect(countBayScheduleFilterMatches({ bays, filter: filterWith({ bayId: bay1 }), jobsById })).toBe(2);
    expect(countBayScheduleFilterMatches({ bays, filter: filterWith({ customerId: customerA }), jobsById })).toBe(1);
    expect(
      countBayScheduleFilterMatches({
        bays,
        filter: filterWith({ bayId: bay2, customerId: customerA }),
        jobsById,
      }),
    ).toBe(0);
  });
});
