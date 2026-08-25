import { DateOnlyIso, type Department, type UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  type BoardFilter,
  countBoardFilterMatches,
  emptyBoardFilter,
  getEarliestBoardFilterMatchStart,
  hasActiveBoardFilter,
  slotMatchesBoardFilter as rawSlotMatchesBoardFilter,
  selectBaysWithBoardFilterMatches,
} from './board-filter.js';

const id = (value: string) => value as UUID;
const day = (value: string) => DateOnlyIso.parse(value);

const bay1 = id('bay-1');
const bay2 = id('bay-2');
const fabrication: Department = 'fabrication';
const paint: Department = 'paint';
const job1 = id('job-1');
const job2 = id('job-2');

const customerA = id('customer-a');
const customerB = id('customer-b');

const jobsById = new Map([
  [job1, { customerId: customerA }],
  [job2, { customerId: customerB }],
]);

const slotMatchesBoardFilter = (
  input: Omit<Parameters<typeof rawSlotMatchesBoardFilter>[0], 'bayDepartment'> & {
    bayDepartment?: Department;
  },
) => {
  const { bayDepartment = fabrication, ...rest } = input;

  return rawSlotMatchesBoardFilter({ ...rest, bayDepartment });
};

const filterWith = (overrides: Partial<BoardFilter>): BoardFilter => ({
  ...emptyBoardFilter,
  ...overrides,
});

describe('hasActiveBoardFilter', () => {
  it('is false for the empty filter', () => {
    expect(hasActiveBoardFilter(emptyBoardFilter)).toBe(false);
  });

  it('is true when any dimension is set', () => {
    expect(hasActiveBoardFilter(filterWith({ bayId: bay1 }))).toBe(true);
    expect(hasActiveBoardFilter(filterWith({ customerId: customerA }))).toBe(true);
    expect(hasActiveBoardFilter(filterWith({ department: fabrication }))).toBe(true);
    expect(hasActiveBoardFilter(filterWith({ jobId: job1 }))).toBe(true);
  });
});

describe('slotMatchesBoardFilter', () => {
  it('matches everything when no filter is active', () => {
    expect(
      slotMatchesBoardFilter({
        bayId: bay1,
        filter: emptyBoardFilter,
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(true);
  });

  it('matches the bay dimension against the slot owning bay', () => {
    const filter = filterWith({ bayId: bay1 });

    expect(slotMatchesBoardFilter({ bayId: bay1, filter, jobsById, slot: { jobId: null } })).toBe(true);
    expect(slotMatchesBoardFilter({ bayId: bay2, filter, jobsById, slot: { jobId: null } })).toBe(false);
  });

  it('matches the department dimension against the slot owning bay', () => {
    const filter = filterWith({ department: fabrication });

    expect(
      slotMatchesBoardFilter({
        bayDepartment: fabrication,
        bayId: bay1,
        filter,
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(true);
    expect(
      slotMatchesBoardFilter({
        bayDepartment: paint,
        bayId: bay2,
        filter,
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(false);
  });

  it('matches the job dimension only for the booked job', () => {
    const filter = filterWith({ jobId: job1 });

    expect(slotMatchesBoardFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job1 } })).toBe(true);
    expect(slotMatchesBoardFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job2 } })).toBe(false);
  });

  it('excludes idle slots when a job or customer filter is active', () => {
    expect(
      slotMatchesBoardFilter({
        bayId: bay1,
        filter: filterWith({ jobId: job1 }),
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(false);
    expect(
      slotMatchesBoardFilter({
        bayId: bay1,
        filter: filterWith({ customerId: customerA }),
        jobsById,
        slot: { jobId: null },
      }),
    ).toBe(false);
  });

  it('matches the customer dimension through the booked job', () => {
    const filter = filterWith({ customerId: customerA });

    expect(slotMatchesBoardFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job1 } })).toBe(true);
    expect(slotMatchesBoardFilter({ bayId: bay1, filter, jobsById, slot: { jobId: job2 } })).toBe(false);
    expect(slotMatchesBoardFilter({ bayId: bay1, filter, jobsById, slot: { jobId: id('job-missing') } })).toBe(false);
  });

  it('requires every active dimension to match', () => {
    const filter = filterWith({ bayId: bay1, customerId: customerA, department: fabrication, jobId: job1 });

    expect(
      slotMatchesBoardFilter({
        bayDepartment: fabrication,
        bayId: bay1,
        filter,
        jobsById,
        slot: { jobId: job1 },
      }),
    ).toBe(true);
    expect(
      slotMatchesBoardFilter({
        bayDepartment: fabrication,
        bayId: bay2,
        filter,
        jobsById,
        slot: { jobId: job1 },
      }),
    ).toBe(false);
    expect(
      slotMatchesBoardFilter({
        bayDepartment: paint,
        bayId: bay1,
        filter,
        jobsById,
        slot: { jobId: job1 },
      }),
    ).toBe(false);
    expect(
      slotMatchesBoardFilter({
        bayDepartment: fabrication,
        bayId: bay1,
        filter,
        jobsById,
        slot: { jobId: job2 },
      }),
    ).toBe(false);
  });
});

describe('countBoardFilterMatches', () => {
  const bays = [
    { department: fabrication, id: bay1, slots: [{ jobId: job1 }, { jobId: null }] },
    { department: paint, id: bay2, slots: [{ jobId: job2 }] },
  ];

  it('counts every slot for the empty filter', () => {
    expect(countBoardFilterMatches({ bays, filter: emptyBoardFilter, jobsById })).toBe(3);
  });

  it('counts only slots matching all active dimensions', () => {
    expect(countBoardFilterMatches({ bays, filter: filterWith({ bayId: bay1 }), jobsById })).toBe(2);
    expect(countBoardFilterMatches({ bays, filter: filterWith({ customerId: customerA }), jobsById })).toBe(1);
    expect(countBoardFilterMatches({ bays, filter: filterWith({ department: fabrication }), jobsById })).toBe(2);
    expect(
      countBoardFilterMatches({
        bays,
        filter: filterWith({ bayId: bay2, customerId: customerA }),
        jobsById,
      }),
    ).toBe(0);
  });
});

describe('selectBaysWithBoardFilterMatches', () => {
  const bays = [
    { department: fabrication, id: bay1, slots: [{ jobId: job1 }, { jobId: null }] },
    { department: paint, id: bay2, slots: [{ jobId: job2 }] },
  ];
  const laneIds = (filter: BoardFilter) =>
    selectBaysWithBoardFilterMatches({ bays, filter, jobsById }).map((bay) => bay.id);

  it('keeps every lane while no filter is active', () => {
    expect(laneIds(emptyBoardFilter)).toEqual([bay1, bay2]);
  });

  it('drops the lanes the filter found nothing in', () => {
    expect(laneIds(filterWith({ jobId: job2 }))).toEqual([bay2]);
    expect(laneIds(filterWith({ customerId: customerA }))).toEqual([bay1]);
    expect(laneIds(filterWith({ department: paint }))).toEqual([bay2]);
  });

  it('keeps a surviving lane whole, so a match still reads against its queue', () => {
    const [lane] = selectBaysWithBoardFilterMatches({ bays, filter: filterWith({ jobId: job1 }), jobsById });

    expect(lane?.slots).toHaveLength(2);
  });

  it('drops every lane when nothing matches, rather than falling back to all of them', () => {
    expect(laneIds(filterWith({ bayId: bay2, customerId: customerA }))).toEqual([]);
  });
});

describe('getEarliestBoardFilterMatchStart', () => {
  const bays = [
    {
      department: paint,
      id: bay2,
      slots: [
        { jobId: job2, startDate: day('2026-06-14') },
        { jobId: null, startDate: day('2026-06-09') },
      ],
    },
    {
      department: fabrication,
      id: bay1,
      slots: [
        { jobId: job1, startDate: day('2026-06-12') },
        { jobId: job1, startDate: day('2026-06-10') },
      ],
    },
  ];

  it('finds the earliest matching slot across unsorted bays and slots', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ jobId: job1 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-10');
  });

  it('does not prioritize future slots for a job-only filter', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ jobId: job1 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-10');
  });

  it('recomputes the earliest slot for a different filter value', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ jobId: job2 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-14');
  });

  it('returns null when no slots match', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2, customerId: customerA }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBeNull();
  });

  it('prioritizes the earliest future match for customer filters', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ customerId: customerA }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-12');
  });

  it('prioritizes the earliest future match for bay filters', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2 }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-14');
  });

  it('prioritizes the earliest future match for department filters', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ department: fabrication }),
        jobsById,
        today: day('2026-06-11'),
      }),
    ).toBe('2026-06-12');
  });

  it('includes today slots when prioritizing customer and bay filters', () => {
    const todaySlot = {
      jobId: job1,
      startDate: day('2026-06-11'),
    };

    expect(
      getEarliestBoardFilterMatchStart({
        bays: [
          {
            department: fabrication,
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
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ customerId: customerA }),
        jobsById,
        today: day('2026-06-13'),
      }),
    ).toBe('2026-06-10');
  });

  it('preserves idle slot behavior under job and customer filters', () => {
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2 }),
        jobsById,
        today: day('2026-06-15'),
      }),
    ).toBe('2026-06-09');
    expect(
      getEarliestBoardFilterMatchStart({
        bays,
        filter: filterWith({ bayId: bay2, customerId: customerB }),
        jobsById,
        today: day('2026-06-15'),
      }),
    ).toBe('2026-06-14');
  });
});
