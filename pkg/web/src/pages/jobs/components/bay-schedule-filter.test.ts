import { DateOnlyIso, type UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  type BayScheduleFilter,
  countBayScheduleFilterMatches,
  emptyBayScheduleFilter,
  getEarliestBayScheduleFilterMatchStart,
  hasActiveBayScheduleFilter,
  slotMatchesBayScheduleFilter,
} from './bay-schedule-filter.js';

const id = (value: string) => value as UUID;
const day = (value: string) => DateOnlyIso.parse(value);

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

describe('getEarliestBayScheduleFilterMatchStart', () => {
  const bays = [
    {
      id: bay2,
      slots: [
        { jobId: job2, startDate: day('2026-06-14') },
        { jobId: null, startDate: day('2026-06-09') },
      ],
    },
    {
      id: bay1,
      slots: [
        { jobId: job1, startDate: day('2026-06-12') },
        { jobId: job1, startDate: day('2026-06-10') },
      ],
    },
  ];

  it('finds the earliest matching slot across unsorted bays and slots', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ jobId: job1 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-10');
  });

  it('does not prioritize future slots for a job-only filter', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ jobId: job1 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-10');
  });

  it('recomputes the earliest slot for a different filter value', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ jobId: job2 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-14');
  });

  it('returns null when no slots match', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2, customerId: customerA }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBeNull();
  });

  it('prioritizes the earliest future match for customer filters', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ customerId: customerA }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-12');
  });

  it('prioritizes the earliest future match for bay filters', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-14');
  });

  it('includes today slots when prioritizing customer and bay filters', () => {
    const todaySlot = {
      jobId: job1,
      startDate: day('2026-06-11'),
    };

    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays: [
          {
            id: bay1,
            slots: [
              { jobId: job1, startDate: day('2026-06-12') },
              todaySlot,
              { jobId: job1, startDate: day('2026-06-09') },
            ],
          },
        ],
        filter: filterWith({ bayId: bay1, customerId: customerA }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe(todaySlot.startDate);
  });

  it('falls back to the earliest match when a customer or bay filter has no future matches', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ customerId: customerA }),
        jobsById,
        today: day('2026-06-13'),
      }),
    ).toBe('2026-06-10');
  });

  it('preserves idle slot behavior under job and customer filters', () => {
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2 }),
        jobsById,
        today: day('2026-06-15'),
      }),
    ).toBe('2026-06-09');
    expect(
      getEarliestBayScheduleFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2, customerId: customerB }),
        jobsById,
        today: day('2026-06-15'),
      }),
    ).toBe('2026-06-14');
  });
});
