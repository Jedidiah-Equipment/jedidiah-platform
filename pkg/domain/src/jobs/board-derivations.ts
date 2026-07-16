import type {
  DateOnlyIso,
  OffDay,
  ProjectedBayQueue,
  ProjectedIdleJobSlot,
  ProjectedJobSlot,
  ProjectedWorkJobSlot,
  UUID,
} from '@pkg/schema';

import { addDateOnlyDays, endOfDateOnlyWeek } from '../formatting/date-only.js';
import { JOB_DEPARTMENT_PIPELINE } from './job-department-pipeline.js';
import { countWorkingDaysBetween, isWorkingDay, type WorkingCalendar } from './working-calendar.js';

// Pure derivations over projected Bay Queues (`jobs.listBays`), shared by the web shop-floor
// dashboard widgets and the mobile Bay screens. Disabled Bays are excluded everywhere; callers filter
// through listEnabledBays before deriving.

export const BAY_RUNWAY_CAP_WORKING_DAYS = 30;

export function listEnabledBays(bays: readonly ProjectedBayQueue[]): ProjectedBayQueue[] {
  return bays.filter((bay) => bay.disabledAt === null);
}

const bayDepartmentOrder = new Map(JOB_DEPARTMENT_PIPELINE.map((step, index) => [step.department, index] as const));

/** Bay ordering shared across viewers: department pipeline order, then Bay name within a department. */
export function byBayDepartmentPipeline(left: ProjectedBayQueue, right: ProjectedBayQueue): number {
  const order =
    (bayDepartmentOrder.get(left.department) ?? Number.MAX_SAFE_INTEGER) -
    (bayDepartmentOrder.get(right.department) ?? Number.MAX_SAFE_INTEGER);

  return order !== 0 ? order : left.name.localeCompare(right.name);
}

export type BayTodayOccupancy =
  | { kind: 'free' }
  | { kind: 'idle'; slot: ProjectedIdleJobSlot }
  | { kind: 'off'; label: string | null }
  | { kind: 'work'; slot: ProjectedWorkJobSlot };

export function getBayTodayOccupancy({
  bay,
  today,
  workingCalendar,
}: {
  bay: ProjectedBayQueue;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): BayTodayOccupancy {
  if (!isWorkingDay(today, workingCalendar)) {
    const exception = bay.calendarExceptions.find(
      (calendarException) => calendarException.date === today && calendarException.direction === 'off',
    );

    return { kind: 'off', label: exception?.label ?? null };
  }

  const slot = findSlotCoveringDate(bay.slots, today);

  if (!slot) {
    return { kind: 'free' };
  }

  return slot.kind === 'work' ? { kind: 'work', slot } : { kind: 'idle', slot };
}

/**
 * The Work Slot active today on a Bay, or null when today falls in an idle Slot, a gap, or past the
 * queue. The Board builder owns the active/done/scheduled rule; this derivation only reads it.
 * (Bay occupancy/utilisation, which does treat off-days as idle, lives in {@link getBayTodayOccupancy}.)
 */
export function findActiveWorkSlot({ bay }: { bay: ProjectedBayQueue }): ProjectedWorkJobSlot | null {
  return (
    bay.slots.find((slot): slot is ProjectedWorkJobSlot => slot.kind === 'work' && slot.state === 'active') ?? null
  );
}

/**
 * Work Slots in queue order whose projected state is not done, optionally excluding the active Slot.
 * This deliberately includes a covering-today Slot when it was not excluded; `state === 'scheduled'`
 * would drop that Slot and change the mobile UP NEXT pane.
 */
export function listUpcomingWorkSlots({
  bay,
  excludeSlotId,
}: {
  bay: ProjectedBayQueue;
  excludeSlotId?: string;
}): ProjectedWorkJobSlot[] {
  return bay.slots.filter(
    (slot): slot is ProjectedWorkJobSlot => slot.kind === 'work' && slot.id !== excludeSlotId && slot.state !== 'done',
  );
}

export type WorkSlotSpan = {
  /** Inclusive last working day, as projected. */
  lastWorkDay: DateOnlyIso;
  /** Working days the Slot spans, excluding closures. */
  workDays: number;
};

/** A projected Slot's calendar span: its inclusive last working day and total working days. */
export function summarizeWorkSlotSpan({
  slot,
  workingCalendar,
}: {
  slot: ProjectedJobSlot;
  workingCalendar: WorkingCalendar;
}): WorkSlotSpan {
  return {
    lastWorkDay: slot.lastWorkDay,
    workDays: countWorkingDaysBetween(slot.startDate, slot.endDate, workingCalendar),
  };
}

export function getOffDayLabel(offDays: readonly OffDay[], date: DateOnlyIso): string | null {
  return offDays.find((offDay) => offDay.date === date)?.label ?? null;
}

export type BayRunway = {
  bayId: UUID;
  bayName: string;
  idleDays: number;
  /** Any booked slot — work or idle — extends beyond the cap window. */
  overflow: boolean;
  workDays: number;
};

export function computeBayRunway({
  bay,
  capWorkingDays = BAY_RUNWAY_CAP_WORKING_DAYS,
  today,
  workingCalendar,
}: {
  bay: ProjectedBayQueue;
  capWorkingDays?: number;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): BayRunway {
  let cursor = today;
  let counted = 0;
  let workDays = 0;
  let idleDays = 0;

  while (counted < capWorkingDays) {
    if (isWorkingDay(cursor, workingCalendar)) {
      const slot = findSlotCoveringDate(bay.slots, cursor);

      if (slot?.kind === 'work') {
        workDays += 1;
      } else if (slot?.kind === 'idle') {
        idleDays += 1;
      }

      counted += 1;
    }

    cursor = addDateOnlyDays(cursor, 1);
  }

  // After the loop, cursor is the calendar day after the cap's last working day; a slot
  // whose half-open end extends past it still has booked days beyond the window.
  return {
    bayId: bay.id,
    bayName: bay.name,
    idleDays,
    overflow: bay.slots.some((slot) => slot.endDate > cursor),
    workDays,
  };
}

/** A Job's projected finish: the last Work Slot end date across the given Bays. */
export function getJobProjectedFinishDates(bays: readonly ProjectedBayQueue[]): Map<UUID, DateOnlyIso> {
  const finishDates = new Map<UUID, DateOnlyIso>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind !== 'work') {
        continue;
      }

      const current = finishDates.get(slot.jobId);

      if (!current || slot.endDate > current) {
        finishDates.set(slot.jobId, slot.endDate);
      }
    }
  }

  return finishDates;
}

export function isJobDeliveryAtRisk({
  finishDatesByJobId,
  jobId,
  plannedDeliveryDate,
}: {
  finishDatesByJobId: ReadonlyMap<UUID, DateOnlyIso>;
  jobId: UUID;
  plannedDeliveryDate: DateOnlyIso;
}): boolean {
  const projectedFinishDate = finishDatesByJobId.get(jobId);

  return projectedFinishDate ? projectedFinishDate > plannedDeliveryDate : false;
}

export type ActiveJobsSummary = {
  activeJobs: number;
  finishingThisWeek: number;
};

export function countActiveJobs({
  bays,
  today,
}: {
  bays: readonly ProjectedBayQueue[];
  today: DateOnlyIso;
}): ActiveJobsSummary {
  const weekEnd = endOfDateOnlyWeek(today);
  let activeJobs = 0;
  let finishingThisWeek = 0;

  for (const [, finishDate] of getJobProjectedFinishDates(bays)) {
    // Slot spans are half-open, so remaining work means the finish date is after today.
    if (finishDate <= today) {
      continue;
    }

    activeJobs += 1;

    const lastWorkDay = addDateOnlyDays(finishDate, -1);

    if (lastWorkDay <= weekEnd) {
      finishingThisWeek += 1;
    }
  }

  return { activeJobs, finishingThisWeek };
}

export type BayLoadToday = {
  freeCount: number;
  idleCount: number;
  /** Percentage of enabled Bays with a Work Slot covering today; 0 when there are no Bays. */
  loadPercent: number;
  offCount: number;
  totalCount: number;
  workingCount: number;
};

export function computeBayLoadToday({
  bays,
  today,
  workingCalendarsByBayId,
}: {
  bays: readonly ProjectedBayQueue[];
  today: DateOnlyIso;
  workingCalendarsByBayId: ReadonlyMap<string, WorkingCalendar>;
}): BayLoadToday {
  let workingCount = 0;
  let idleCount = 0;
  let offCount = 0;
  let freeCount = 0;

  for (const bay of bays) {
    const occupancy = getBayTodayOccupancy({
      bay,
      today,
      workingCalendar: workingCalendarsByBayId.get(bay.id) ?? {},
    });

    if (occupancy.kind === 'work') {
      workingCount += 1;
    } else if (occupancy.kind === 'idle') {
      idleCount += 1;
    } else if (occupancy.kind === 'off') {
      offCount += 1;
    } else {
      freeCount += 1;
    }
  }

  const totalCount = bays.length;

  return {
    freeCount,
    idleCount,
    loadPercent: totalCount === 0 ? 0 : Math.round((workingCount / totalCount) * 100),
    offCount,
    totalCount,
    workingCount,
  };
}

function findSlotCoveringDate(slots: readonly ProjectedJobSlot[], date: DateOnlyIso): ProjectedJobSlot | null {
  return slots.find((slot) => slot.startDate <= date && date < slot.endDate) ?? null;
}
