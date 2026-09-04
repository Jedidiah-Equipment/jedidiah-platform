import type { DateOnlyIso, UUID } from '@pkg/schema';
import type { Department, ProjectedBayQueue, ProjectedJobSlot } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import {
  byBayDepartmentPipeline,
  computeBayLoadToday,
  computeBayLoadTodayByDepartment,
  computeBayRunway,
  countActiveJobs,
  findActiveWorkSlot,
  getBayTodayOccupancy,
  getJobProjectedFinishDates,
  getNextJobIds,
  getOffDayLabel,
  groupBaysByDepartmentPipeline,
  isJobDeliveryAtRisk,
  listEnabledBays,
  listNextWorkSlots,
  listScheduledJobs,
  listUpcomingWorkSlots,
} from './board-derivations.js';
import { labelWorkDays } from './job-slot-projection.js';
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
    firstWorkDay?: string;
    id: string;
    jobId?: string;
    lastWorkDay?: string;
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
    ...labelDays(input),
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
    firstWorkDay?: string;
    id: string;
    label?: string | null;
    lastWorkDay?: string;
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
    ...labelDays(input),
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

/** Label dates default to an empty-calendar span; tests pass them explicitly to model off-days. */
function labelDays(input: { endDate: string; firstWorkDay?: string; lastWorkDay?: string; startDate: string }) {
  const defaults = labelWorkDays(day(input.startDate), day(input.endDate), {});

  return {
    firstWorkDay: input.firstWorkDay ? day(input.firstWorkDay) : defaults.firstWorkDay,
    lastWorkDay: input.lastWorkDay ? day(input.lastWorkDay) : defaults.lastWorkDay,
  };
}

function buildBay(input: {
  calendarExceptions?: ProjectedBayQueue['calendarExceptions'];
  currentOperator?: { name: string } | null;
  department?: Department;
  disabledAt?: string | null;
  id: string;
  name?: string;
  slots?: ProjectedJobSlot[];
}): ProjectedBayQueue {
  return {
    calendarExceptions: input.calendarExceptions ?? [],
    createdAt: timestamp,
    currentOperator: input.currentOperator ?? null,
    department: input.department ?? 'fabrication',
    disabledAt: input.disabledAt ?? null,
    id: id(input.id),
    name: input.name ?? `Bay ${input.id}`,
    nextAvailableDate: today,
    scheduleOrigin: today,
    slots: input.slots ?? [],
    updatedAt: timestamp,
  } as unknown as ProjectedBayQueue;
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
    // 'fabrication' precedes 'procurement' in the pipeline; names tiebreak within a department.
    const fabB = buildBay({ department: 'fabrication', id: 'bay-1', name: 'Bay B' });
    const fabA = buildBay({ department: 'fabrication', id: 'bay-2', name: 'Bay A' });
    const procurement = buildBay({ department: 'procurement', id: 'bay-3', name: 'Bay Z' });

    expect([fabB, fabA, procurement].sort(byBayDepartmentPipeline)).toEqual([fabA, fabB, procurement]);
  });
});

describe('groupBaysByDepartmentPipeline', () => {
  const bay = (department: Department, name: string) => buildBay({ department, id: name, name });

  it('orders groups by the pipeline, not by the order the bays arrive in', () => {
    const bays = [bay('workshop', 'Wksp 1'), bay('paint', 'Paint 1'), bay('fabrication', 'Fab 1')];

    expect(groupBaysByDepartmentPipeline(bays).map((group) => group.department)).toEqual([
      'fabrication',
      'paint',
      'workshop',
    ]);
  });

  it('keeps the incoming order of bays within a department and omits departments with no bays', () => {
    const bays = [bay('paint', 'Paint Z'), bay('fabrication', 'Fab A'), bay('paint', 'Paint A')];

    expect(groupBaysByDepartmentPipeline(bays).map((group) => group.bays.map((entry) => entry.name))).toEqual([
      ['Fab A'],
      ['Paint Z', 'Paint A'],
    ]);
  });

  it('gives a department outside the pipeline one trailing group rather than a duplicate heading', () => {
    const bays = [bay('stores' as Department, 'Stores 1'), bay('paint', 'Paint 1'), bay('stores' as Department, 'S 2')];
    const groups = groupBaysByDepartmentPipeline(bays);

    expect(groups.map((group) => group.department)).toEqual(['paint', 'stores']);
    expect(groups[1]?.bays.map((entry) => entry.name)).toEqual(['Stores 1', 'S 2']);
  });

  it('does not mutate the input array', () => {
    const bays = [bay('workshop', 'Wksp 1'), bay('fabrication', 'Fab 1')];
    const original = [...bays];

    groupBaysByDepartmentPipeline(bays);

    expect(bays).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(groupBaysByDepartmentPipeline([])).toEqual([]);
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

describe('getNextJobIds', () => {
  it('returns the Work Job immediately after the active Slot', () => {
    const bayId = id('bay-1');
    const active = buildWorkSlot(bayId, {
      durationDays: 1,
      endDate: '2026-06-06',
      id: 'slot-active',
      jobId: 'job-active',
      sequence: 1,
      startDate: '2026-06-05',
    });
    const next = buildWorkSlot(bayId, {
      durationDays: 2,
      endDate: '2026-06-08',
      id: 'slot-next',
      jobId: 'job-next',
      sequence: 2,
      startDate: '2026-06-06',
    });
    const later = buildWorkSlot(bayId, {
      durationDays: 2,
      endDate: '2026-06-10',
      id: 'slot-later',
      jobId: 'job-later',
      sequence: 3,
      startDate: '2026-06-08',
    });

    const bay = buildBay({ id: 'bay-1', slots: [active, next, later] });

    expect(listNextWorkSlots([bay])).toEqual([next]);
    expect([...getNextJobIds([bay])]).toEqual([id('job-next')]);
  });

  it('does not skip an immediate Idle Slot to mark a later Work Job as next', () => {
    const bayId = id('bay-1');
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
    const later = buildWorkSlot(bayId, {
      durationDays: 2,
      endDate: '2026-06-09',
      id: 'slot-later',
      jobId: 'job-later',
      sequence: 3,
      startDate: '2026-06-07',
    });

    const bay = buildBay({ id: 'bay-1', slots: [active, idle, later] });

    expect(listNextWorkSlots([bay])).toEqual([]);
    expect([...getNextJobIds([bay])]).toEqual([]);
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
  it('splits remaining working days into in-progress and scheduled work', () => {
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
        buildWorkSlot(bayId, {
          durationDays: 3,
          endDate: '2026-06-13',
          id: 'slot-b',
          sequence: 2,
          startDate: '2026-06-10',
          state: 'scheduled',
        }),
      ],
    });

    expect(computeBayRunway({ bay, today, workingCalendar: {} })).toEqual({
      bayId,
      inProgressWorkDays: 5,
      label: 'Bay bay-1',
      overflow: false,
      scheduledWorkDays: 3,
    });
  });

  it('uses the current operator as the chart label', () => {
    const bay = buildBay({ currentOperator: { name: 'Bonginkosi' }, id: 'bay-1' });

    expect(computeBayRunway({ bay, today, workingCalendar: {} }).label).toBe('Bonginkosi');
  });

  it('ignores idle time and flags overflow when scheduled work extends beyond the cap window', () => {
    const bayId = id('bay-1');
    const bay = buildBay({
      id: 'bay-1',
      slots: [
        buildIdleSlot(bayId, {
          durationDays: 2,
          endDate: '2026-06-07',
          id: 'slot-idle',
          sequence: 1,
          startDate: '2026-06-05',
        }),
        buildWorkSlot(bayId, {
          durationDays: 32,
          endDate: '2026-07-09',
          id: 'slot-scheduled',
          sequence: 2,
          startDate: '2026-06-07',
          state: 'scheduled',
        }),
      ],
    });

    expect(computeBayRunway({ bay, today, workingCalendar: {} })).toMatchObject({
      inProgressWorkDays: 0,
      overflow: true,
      scheduledWorkDays: 28,
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
      inProgressWorkDays: 30,
      label: 'Bay bay-1',
      overflow: true,
      scheduledWorkDays: 0,
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
      inProgressWorkDays: 30,
      overflow: false,
      scheduledWorkDays: 0,
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
      inProgressWorkDays: 2,
      scheduledWorkDays: 0,
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

  it('computes load independently for each department in pipeline order', () => {
    const fabricationWork = buildBay({
      department: 'fabrication',
      id: 'fab-work',
      slots: [
        buildWorkSlot(id('fab-work'), {
          durationDays: 1,
          endDate: '2026-06-06',
          id: 'slot-work',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });
    const fabricationIdle = buildBay({
      department: 'fabrication',
      id: 'fab-idle',
      slots: [
        buildIdleSlot(id('fab-idle'), {
          durationDays: 1,
          endDate: '2026-06-06',
          id: 'slot-idle',
          sequence: 1,
          startDate: '2026-06-05',
        }),
      ],
    });
    const procurementFree = buildBay({ department: 'procurement', id: 'procurement-free' });
    const bays = [procurementFree, fabricationIdle, fabricationWork];

    expect(computeBayLoadTodayByDepartment({ bays, today, workingCalendarsByBayId: emptyCalendarsFor(bays) })).toEqual([
      {
        department: 'fabrication',
        freeCount: 0,
        idleCount: 1,
        loadPercent: 50,
        offCount: 0,
        totalCount: 2,
        workingCount: 1,
      },
      {
        department: 'procurement',
        freeCount: 1,
        idleCount: 0,
        loadPercent: 0,
        offCount: 0,
        totalCount: 1,
        workingCount: 0,
      },
    ]);
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

describe('listScheduledJobs', () => {
  it('lists only jobs whose every work slot is still scheduled, earliest start first', () => {
    const bayId = id('bay-1');
    const bay = buildBay({
      id: 'bay-1',
      name: 'Fab Bay 1',
      slots: [
        // Already finished before today.
        buildWorkSlot(bayId, {
          durationDays: 1,
          endDate: '2026-06-03',
          id: 'slot-done',
          jobId: 'job-done',
          sequence: 1,
          startDate: '2026-06-02',
        }),
        // Covers today.
        buildWorkSlot(bayId, {
          durationDays: 3,
          endDate: '2026-06-09',
          id: 'slot-active',
          jobId: 'job-active',
          sequence: 2,
          startDate: '2026-06-04',
        }),
        buildWorkSlot(bayId, {
          durationDays: 2,
          endDate: '2026-06-18',
          id: 'slot-later',
          jobId: 'job-later',
          sequence: 4,
          startDate: '2026-06-16',
        }),
        buildWorkSlot(bayId, {
          durationDays: 2,
          endDate: '2026-06-12',
          id: 'slot-sooner',
          jobId: 'job-sooner',
          sequence: 3,
          startDate: '2026-06-10',
        }),
        // Idle slots carry no job and never appear.
        buildIdleSlot(bayId, {
          durationDays: 1,
          endDate: '2026-06-20',
          id: 'slot-idle',
          sequence: 5,
          startDate: '2026-06-19',
        }),
      ],
    });

    expect(listScheduledJobs({ bays: [bay] })).toEqual([
      { bayId, bayName: 'Fab Bay 1', jobId: id('job-sooner'), operatorName: null, startDate: day('2026-06-10') },
      { bayId, bayName: 'Fab Bay 1', jobId: id('job-later'), operatorName: null, startDate: day('2026-06-16') },
    ]);
  });

  it('carries the operator on the Bay so a caller can name who has the work', () => {
    const bay = buildBay({
      currentOperator: { name: 'Bonginkosi' },
      id: 'bay-1',
      name: 'Fabrication Bay 3 - Bonginkosi',
      slots: [
        buildWorkSlot(id('bay-1'), {
          durationDays: 2,
          endDate: '2026-06-12',
          id: 'slot-scheduled',
          jobId: 'job-1',
          sequence: 1,
          startDate: '2026-06-10',
        }),
      ],
    });

    expect(listScheduledJobs({ bays: [bay] })).toMatchObject([{ operatorName: 'Bonginkosi' }]);
  });

  it('drops a job that is already underway in another bay', () => {
    const scheduledBay = buildBay({
      id: 'bay-1',
      slots: [
        buildWorkSlot(id('bay-1'), {
          durationDays: 2,
          endDate: '2026-06-12',
          id: 'slot-scheduled',
          jobId: 'job-split',
          sequence: 1,
          startDate: '2026-06-10',
        }),
      ],
    });
    // The same job is on the floor elsewhere, so it is active rather than scheduled.
    const activeBay = buildBay({
      id: 'bay-2',
      slots: [
        buildWorkSlot(id('bay-2'), {
          durationDays: 3,
          endDate: '2026-06-08',
          id: 'slot-running',
          jobId: 'job-split',
          sequence: 1,
          startDate: '2026-06-04',
        }),
      ],
    });

    expect(listScheduledJobs({ bays: [scheduledBay, activeBay] })).toEqual([]);
  });

  it('reports the earliest booked slot and its bay for a job scheduled across bays', () => {
    const lateBay = buildBay({
      id: 'bay-2',
      name: 'Paint Bay 2',
      slots: [
        buildWorkSlot(id('bay-2'), {
          durationDays: 2,
          endDate: '2026-06-20',
          id: 'slot-late',
          jobId: 'job-multi',
          sequence: 1,
          startDate: '2026-06-18',
        }),
      ],
    });
    const earlyBay = buildBay({
      id: 'bay-1',
      name: 'Fab Bay 1',
      slots: [
        buildWorkSlot(id('bay-1'), {
          durationDays: 2,
          endDate: '2026-06-12',
          id: 'slot-early',
          jobId: 'job-multi',
          sequence: 1,
          startDate: '2026-06-10',
        }),
      ],
    });

    expect(listScheduledJobs({ bays: [lateBay, earlyBay] })).toEqual([
      {
        bayId: id('bay-1'),
        bayName: 'Fab Bay 1',
        jobId: id('job-multi'),
        operatorName: null,
        startDate: day('2026-06-10'),
      },
    ]);
  });

  it('returns nothing when no bay has a booked slot', () => {
    expect(listScheduledJobs({ bays: [buildBay({ id: 'bay-1' })] })).toEqual([]);
  });
});

function emptyCalendarsFor(bays: readonly ProjectedBayQueue[]): Map<string, WorkingCalendar> {
  return new Map(bays.map((bay) => [bay.id, {}]));
}
