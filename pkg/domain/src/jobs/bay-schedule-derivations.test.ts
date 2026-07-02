import type { BaySchedule, DateOnlyIso, Department, ProjectedJobSlot, UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  byBayDepartmentPipeline,
  computeBayLoadToday,
  computeBayRunway,
  countActiveJobs,
  findActiveWorkSlot,
  getBayTodayOccupancy,
  getJobProjectedFinishDates,
  getOffDayLabel,
  isJobDeliveryAtRisk,
  listEnabledBays,
  listUpcomingWorkSlots,
  summarizeWorkSlotSpan,
} from './bay-schedule-derivations.js';
import type { WorkingCalendar } from './working-calendar.js';

const id = (value: string) => value as UUID;
const day = (value: string) => value as DateOnlyIso;
const timestamp = '2026-06-01T00:00:00.000Z';
// 2026-06-05 is a Friday; the Monday-start week containing it ends Sunday 2026-06-07.
const today = day('2026-06-05');

function buildWorkSlot(
  bayId: UUID,
  input: {
    durationDays: number;
    endDate: string;
    id: string;
    jobId?: string;
    sequence: number;
    startDate: string;
    state?: ProjectedJobSlot['state'];
  },
): ProjectedJobSlot {
  return {
    bayId,
    createdAt: timestamp,
    durationDays: input.durationDays,
    endDate: day(input.endDate),
    id: id(input.id),
    jobCode: `JOB-${input.id}`,
    jobId: id(input.jobId ?? `job-${input.id}`),
    kind: 'work',
    label: null,
    sequence: input.sequence,
    startDate: day(input.startDate),
    state: input.state ?? slotStateFor(input.startDate, input.endDate),
    updatedAt: timestamp,
  } as unknown as ProjectedJobSlot;
}

function buildIdleSlot(
  bayId: UUID,
  input: {
    durationDays: number;
    endDate: string;
    id: string;
    label?: string | null;
    sequence: number;
    startDate: string;
    state?: ProjectedJobSlot['state'];
  },
): ProjectedJobSlot {
  return {
    bayId,
    createdAt: timestamp,
    durationDays: input.durationDays,
    endDate: day(input.endDate),
    id: id(input.id),
    jobId: null,
    kind: 'idle',
    label: input.label ?? null,
    sequence: input.sequence,
    startDate: day(input.startDate),
    state: input.state ?? slotStateFor(input.startDate, input.endDate),
    updatedAt: timestamp,
  } as unknown as ProjectedJobSlot;
}

function buildBay(input: {
  calendarExceptions?: BaySchedule['calendarExceptions'];
  department?: Department;
  disabledAt?: string | null;
  id: string;
  name?: string;
  slots?: ProjectedJobSlot[];
}): BaySchedule {
  return {
    calendarExceptions: input.calendarExceptions ?? [],
    createdAt: timestamp,
    department: input.department ?? 'fabrication',
    disabledAt: input.disabledAt ?? null,
    id: id(input.id),
    name: input.name ?? `Bay ${input.id}`,
    nextAvailableDate: today,
    scheduleOrigin: today,
    slots: input.slots ?? [],
    updatedAt: timestamp,
  } as unknown as BaySchedule;
}

function slotStateFor(startDate: string, endDate: string): ProjectedJobSlot['state'] {
  return endDate <= today ? 'done' : startDate <= today ? 'active' : 'scheduled';
}

describe('listEnabledBays', () => {
  it('excludes disabled bays', () => {
    const enabled = buildBay({ id: 'bay-1' });
    const disabled = buildBay({ disabledAt: timestamp, id: 'bay-2' });

    expect(listEnabledBays([enabled, disabled])).toEqual([enabled]);
  });
});

describe('byBayDepartmentPipeline', () => {
  it('orders by department pipeline then bay name', () => {
    // 'procurement' precedes 'fabrication' in the pipeline; names tiebreak within a department.
    const fabB = buildBay({ department: 'fabrication', id: 'bay-1', name: 'Bay B' });
    const fabA = buildBay({ department: 'fabrication', id: 'bay-2', name: 'Bay A' });
    const procurement = buildBay({ department: 'procurement', id: 'bay-3', name: 'Bay Z' });

    expect([fabB, fabA, procurement].sort(byBayDepartmentPipeline)).toEqual([procurement, fabA, fabB]);
  });
});

describe('findActiveWorkSlot', () => {
  const bayId = id('bay-1');

  it('returns the work slot covering today (in progress regardless of the working calendar)', () => {
    // No working-calendar input: a covering Slot is in progress even when today is an off-day, since
    // the Job sits on the Bay whether or not anyone works that day.
    const slot = buildWorkSlot(bayId, {
      durationDays: 3,
      endDate: '2026-06-08',
      id: 'slot-a',
      sequence: 1,
      startDate: '2026-06-05',
    });
    const bay = buildBay({ id: 'bay-1', slots: [slot] });

    expect(findActiveWorkSlot({ bay })).toEqual(slot);
  });

  it('returns null when an idle slot covers today', () => {
    const slot = buildIdleSlot(bayId, {
      durationDays: 2,
      endDate: '2026-06-06',
      id: 'slot-a',
      sequence: 1,
      startDate: '2026-06-04',
    });
    const bay = buildBay({ id: 'bay-1', slots: [slot] });

    expect(findActiveWorkSlot({ bay })).toBeNull();
  });
});

describe('listUpcomingWorkSlots', () => {
  const bayId = id('bay-1');

  it('returns future work slots in queue order, excluding idle and the active slot', () => {
    const active = buildWorkSlot(bayId, {
      durationDays: 1,
      endDate: '2026-06-06',
      id: 'slot-active',
      sequence: 1,
      startDate: '2026-06-05',
    });
    const idle = buildIdleSlot(bayId, {
      durationDays: 1,
      endDate: '2026-06-07',
      id: 'slot-idle',
      sequence: 2,
      startDate: '2026-06-06',
    });
    const next = buildWorkSlot(bayId, {
      durationDays: 2,
      endDate: '2026-06-09',
      id: 'slot-next',
      sequence: 3,
      startDate: '2026-06-07',
    });
    const bay = buildBay({ id: 'bay-1', slots: [active, idle, next] });

    expect(listUpcomingWorkSlots({ bay, excludeSlotId: active.id })).toEqual([next]);
  });

  it('keeps a work slot covering today when it is not the excluded active slot', () => {
    const covering = buildWorkSlot(bayId, {
      durationDays: 3,
      endDate: '2026-06-08',
      id: 'slot-a',
      sequence: 1,
      startDate: '2026-06-05',
    });
    const bay = buildBay({ id: 'bay-1', slots: [covering] });

    // No active slot excluded, so the covering slot stays in the list.
    expect(listUpcomingWorkSlots({ bay })).toEqual([covering]);
  });
});

describe('summarizeWorkSlotSpan', () => {
  it('returns the inclusive last work day and working-day count', () => {
    const slot = buildWorkSlot(id('bay-1'), {
      durationDays: 3,
      endDate: '2026-06-10',
      id: 'slot-a',
      sequence: 1,
      startDate: '2026-06-05',
    });
    // 06-06 and 06-07 are off, so the half-open span 06-05..06-10 has 3 working days.
    const workingCalendar = { orgOffDays: new Set(['2026-06-06', '2026-06-07']) };

    expect(summarizeWorkSlotSpan({ slot, workingCalendar })).toEqual({
      lastWorkDay: day('2026-06-09'),
      workDays: 3,
    });
  });
});

describe('getBayTodayOccupancy', () => {
  it('returns the work slot covering today', () => {
    const bayId = id('bay-1');
    const slot = buildWorkSlot(bayId, {
      durationDays: 3,
      endDate: '2026-06-08',
      id: 'slot-a',
      sequence: 1,
      startDate: '2026-06-05',
    });
    const bay = buildBay({ id: 'bay-1', slots: [slot] });

    expect(getBayTodayOccupancy({ bay, today, workingCalendar: {} })).toEqual({ kind: 'work', slot });
  });

  it('treats the half-open slot end date as no longer occupying the bay', () => {
    const bayId = id('bay-1');
    const slot = buildWorkSlot(bayId, {
      durationDays: 3,
      endDate: '2026-06-05',
      id: 'slot-a',
      sequence: 1,
      startDate: '2026-06-02',
    });
    const bay = buildBay({ id: 'bay-1', slots: [slot] });

    expect(getBayTodayOccupancy({ bay, today, workingCalendar: {} })).toEqual({ kind: 'free' });
  });

  it('returns the idle slot covering today', () => {
    const bayId = id('bay-1');
    const slot = buildIdleSlot(bayId, {
      durationDays: 2,
      endDate: '2026-06-06',
      id: 'slot-a',
      label: 'Maintenance',
      sequence: 1,
      startDate: '2026-06-04',
    });
    const bay = buildBay({ id: 'bay-1', slots: [slot] });

    expect(getBayTodayOccupancy({ bay, today, workingCalendar: {} })).toEqual({ kind: 'idle', slot });
  });

  it('returns off with the bay exception label when today is a bay off-day', () => {
    const bay = buildBay({
      calendarExceptions: [{ bayId: id('bay-1'), date: today, direction: 'off', label: 'Crane repair' }],
      id: 'bay-1',
    });
    const workingCalendar = { bayExceptions: new Map([[today, 'off' as const]]) };

    expect(getBayTodayOccupancy({ bay, today, workingCalendar })).toEqual({ kind: 'off', label: 'Crane repair' });
  });

  it('returns off without a label when today is an org off-day', () => {
    const bay = buildBay({ id: 'bay-1' });
    const workingCalendar = { orgOffDays: new Set([today as string]) };

    expect(getBayTodayOccupancy({ bay, today, workingCalendar })).toEqual({ kind: 'off', label: null });
  });

  it('returns free when no slot covers today', () => {
    const bay = buildBay({ id: 'bay-1' });

    expect(getBayTodayOccupancy({ bay, today, workingCalendar: {} })).toEqual({ kind: 'free' });
  });
});

describe('getOffDayLabel', () => {
  it('returns the matching off-day label', () => {
    expect(getOffDayLabel([{ date: today, label: 'Youth Day' }], today)).toBe('Youth Day');
    expect(getOffDayLabel([{ date: day('2026-06-16'), label: 'Youth Day' }], today)).toBeNull();
  });
});

describe('computeBayRunway', () => {
  it('splits booked working days into work and idle within the cap', () => {
    const bayId = id('bay-1');
    const bay = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(bayId, {
          durationDays: 5,
          endDate: '2026-06-10',
          id: 'slot-a',
          sequence: 1,
          startDate: '2026-06-05',
        }),
        buildIdleSlot(bayId, {
          durationDays: 3,
          endDate: '2026-06-13',
          id: 'slot-b',
          sequence: 2,
          startDate: '2026-06-10',
        }),
      ],
    });

    expect(computeBayRunway({ bay, today, workingCalendar: {} })).toEqual({
      bayId,
      bayName: 'Bay bay-1',
      idleDays: 3,
      overflow: false,
      workDays: 5,
    });
  });

  it('flags overflow when an idle tail extends beyond the cap window', () => {
    const bayId = id('bay-1');
    const bay = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(bayId, {
          durationDays: 30,
          endDate: '2026-07-05',
          id: 'slot-a',
          sequence: 1,
          startDate: '2026-06-05',
        }),
        buildIdleSlot(bayId, {
          durationDays: 2,
          endDate: '2026-07-07',
          id: 'slot-b',
          sequence: 2,
          startDate: '2026-07-05',
        }),
      ],
    });

    expect(computeBayRunway({ bay, today, workingCalendar: {} })).toMatchObject({
      idleDays: 0,
      overflow: true,
      workDays: 30,
    });
  });

  it('counts only the cap window and flags overflow when work extends beyond it', () => {
    const bayId = id('bay-1');
    // 40 consecutive booked days starting today; only the first 30 working days count.
    const bay = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(bayId, {
          durationDays: 40,
          endDate: '2026-07-15',
          id: 'slot-a',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });

    expect(computeBayRunway({ bay, today, workingCalendar: {} })).toEqual({
      bayId,
      bayName: 'Bay bay-1',
      idleDays: 0,
      overflow: true,
      workDays: 30,
    });
  });

  it('does not flag overflow for a slot ending exactly at the cap boundary', () => {
    const bayId = id('bay-1');
    const bay = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(bayId, {
          durationDays: 30,
          endDate: '2026-07-05',
          id: 'slot-a',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });

    expect(computeBayRunway({ bay, today, workingCalendar: {} })).toMatchObject({
      overflow: false,
      workDays: 30,
    });
  });

  it('skips org off-days when counting the cap window', () => {
    const bayId = id('bay-1');
    const bay = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(bayId, {
          durationDays: 2,
          endDate: '2026-06-09',
          id: 'slot-a',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });
    // 06-06 is off, so the slot's working days are 06-05 and 06-07/06-08... the projection
    // already spans the gap; the runway must classify only working days inside the span.
    const workingCalendar = { orgOffDays: new Set(['2026-06-06', '2026-06-07']) };

    expect(computeBayRunway({ bay, capWorkingDays: 4, today, workingCalendar })).toMatchObject({
      idleDays: 0,
      workDays: 2,
    });
  });
});

describe('getJobProjectedFinishDates', () => {
  it('takes the last work slot end date across bays per job', () => {
    const bayA = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(id('bay-1'), {
          durationDays: 3,
          endDate: '2026-06-08',
          id: 'slot-a',
          jobId: 'job-1',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });
    const bayB = buildBay({
      id: 'bay-2',
      slots: [
        buildWorkSlot(id('bay-2'), {
          durationDays: 5,
          endDate: '2026-06-12',
          id: 'slot-b',
          jobId: 'job-1',
          sequence: 1,
          startDate: '2026-06-07',
        }),
        buildIdleSlot(id('bay-2'), {
          durationDays: 2,
          endDate: '2026-06-14',
          id: 'slot-c',
          sequence: 2,
          startDate: '2026-06-12',
        }),
      ],
    });

    expect(getJobProjectedFinishDates([bayA, bayB])).toEqual(new Map([[id('job-1'), day('2026-06-12')]]));
  });
});

describe('isJobDeliveryAtRisk', () => {
  it('flags jobs finishing after the planned delivery date', () => {
    expect(
      isJobDeliveryAtRisk({
        finishDatesByJobId: new Map([[id('job-1'), day('2026-06-12')]]),
        jobId: id('job-1'),
        plannedDeliveryDate: day('2026-06-11'),
      }),
    ).toBe(true);
  });

  it('does not flag jobs finishing on the planned delivery date boundary', () => {
    expect(
      isJobDeliveryAtRisk({
        finishDatesByJobId: new Map([[id('job-1'), day('2026-06-12')]]),
        jobId: id('job-1'),
        plannedDeliveryDate: day('2026-06-12'),
      }),
    ).toBe(false);
  });

  it('does not flag jobs missing from the cached bay projection', () => {
    expect(
      isJobDeliveryAtRisk({
        finishDatesByJobId: new Map([[id('job-2'), day('2026-06-13')]]),
        jobId: id('job-1'),
        plannedDeliveryDate: day('2026-06-12'),
      }),
    ).toBe(false);
  });
});

describe('countActiveJobs', () => {
  it('counts distinct jobs with remaining work and those finishing this week', () => {
    const bayId = id('bay-1');
    const bay = buildBay({
      id: 'bay-1',
      slots: [
        // Finished: end date is today (half-open span, no remaining work).
        buildWorkSlot(bayId, {
          durationDays: 3,
          endDate: '2026-06-05',
          id: 'slot-done',
          jobId: 'job-done',
          sequence: 1,
          startDate: '2026-06-02',
        }),
        // Finishes Friday 06-05..Saturday: last work day 2026-06-06 is inside this week.
        buildWorkSlot(bayId, {
          durationDays: 2,
          endDate: '2026-06-07',
          id: 'slot-week',
          jobId: 'job-week',
          sequence: 2,
          startDate: '2026-06-05',
        }),
        // Runs past Sunday 2026-06-07: active but not finishing this week.
        buildWorkSlot(bayId, {
          durationDays: 6,
          endDate: '2026-06-13',
          id: 'slot-later',
          jobId: 'job-later',
          sequence: 3,
          startDate: '2026-06-07',
        }),
      ],
    });
    // The same job booked in a second bay must not double-count.
    const otherBay = buildBay({
      id: 'bay-2',
      slots: [
        buildWorkSlot(id('bay-2'), {
          durationDays: 1,
          endDate: '2026-06-06',
          id: 'slot-week-2',
          jobId: 'job-week',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });

    expect(countActiveJobs({ bays: [bay, otherBay], today })).toEqual({
      activeJobs: 2,
      finishingThisWeek: 1,
    });
  });

  it('uses the job projected finish across bays for the weekly cutoff', () => {
    // Finishes in bay-1 this week but continues in bay-2 next week.
    const bayA = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(id('bay-1'), {
          durationDays: 1,
          endDate: '2026-06-06',
          id: 'slot-a',
          jobId: 'job-1',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });
    const bayB = buildBay({
      id: 'bay-2',
      slots: [
        buildWorkSlot(id('bay-2'), {
          durationDays: 4,
          endDate: '2026-06-12',
          id: 'slot-b',
          jobId: 'job-1',
          sequence: 1,
          startDate: '2026-06-08',
        }),
      ],
    });

    expect(countActiveJobs({ bays: [bayA, bayB], today })).toEqual({
      activeJobs: 1,
      finishingThisWeek: 0,
    });
  });
});

describe('computeBayLoadToday', () => {
  it('computes the working percentage with idle, off, and free counts', () => {
    const working = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(id('bay-1'), {
          durationDays: 3,
          endDate: '2026-06-08',
          id: 'slot-a',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });
    const idle = buildBay({
      id: 'bay-2',
      slots: [
        buildIdleSlot(id('bay-2'), {
          durationDays: 2,
          endDate: '2026-06-06',
          id: 'slot-b',
          sequence: 1,
          startDate: '2026-06-04',
        }),
      ],
    });
    const off = buildBay({
      calendarExceptions: [{ bayId: id('bay-3'), date: today, direction: 'off', label: null }],
      id: 'bay-3',
    });
    const free = buildBay({ id: 'bay-4' });

    const bays = [working, idle, off, free];
    const workingCalendarsByBayId = emptyCalendarsFor(bays);
    workingCalendarsByBayId.set(off.id, { bayExceptions: new Map([[today, 'off']]) });

    expect(computeBayLoadToday({ bays, today, workingCalendarsByBayId })).toEqual({
      freeCount: 1,
      idleCount: 1,
      loadPercent: 25,
      offCount: 1,
      totalCount: 4,
      workingCount: 1,
    });
  });

  it('returns zero percent when there are no bays', () => {
    expect(computeBayLoadToday({ bays: [], today, workingCalendarsByBayId: new Map() })).toEqual({
      freeCount: 0,
      idleCount: 0,
      loadPercent: 0,
      offCount: 0,
      totalCount: 0,
      workingCount: 0,
    });
  });

  it('treats org off-days as off for every bay without an opening exception', () => {
    const closed = buildBay({ id: 'bay-1' });
    const open = buildBay({
      calendarExceptions: [{ bayId: id('bay-2'), date: today, direction: 'work', label: null }],
      id: 'bay-2',
      slots: [
        buildWorkSlot(id('bay-2'), {
          durationDays: 1,
          endDate: '2026-06-06',
          id: 'slot-a',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });

    expect(
      computeBayLoadToday({
        bays: [closed, open],
        today,
        workingCalendarsByBayId: new Map([
          [closed.id, { orgOffDays: new Set([today]) }],
          [open.id, { bayExceptions: new Map([[today, 'work' as const]]), orgOffDays: new Set([today]) }],
        ]),
      }),
    ).toEqual({
      freeCount: 0,
      idleCount: 0,
      loadPercent: 50,
      offCount: 1,
      totalCount: 2,
      workingCount: 1,
    });
  });
});

function emptyCalendarsFor(bays: readonly BaySchedule[]): Map<string, WorkingCalendar> {
  return new Map(bays.map((bay) => [bay.id, {}]));
}
