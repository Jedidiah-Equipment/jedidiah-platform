import type {
  BaySchedule,
  DateOnlyIso,
  OffDay,
  ProjectedIdleJobSlot,
  ProjectedJobSlot,
  ProjectedWorkJobSlot,
  UUID,
} from '@pkg/schema';

import { addDateOnlyDays, endOfDateOnlyWeek } from '../formatting/date-only.js';
import { bayWorkingCalendars } from './bay-schedule-projection.js';
import { JOB_DEPARTMENT_PIPELINE } from './job-department-pipeline.js';
import { countWorkingDaysBetween, isWorkingDay, type WorkingCalendar } from './working-calendar.js';

// Pure derivations over a projected Bay schedule (`jobs.listBays`), shared by the web shop-floor
// dashboard widgets and the mobile Bay screens. Disabled Bays are excluded everywhere; callers filter
// through listEnabledBays before deriving.

export const BAY_RUNWAY_CAP_WORKING_DAYS = 30;

export function listEnabledBays(bays: readonly BaySchedule[]): BaySchedule[] {
  return bays.filter((bay) => bay.disabledAt === null);
}

const bayDepartmentOrder = new Map(JOB_DEPARTMENT_PIPELINE.map((step, index) => [step.department, index] as const));

/** Bay ordering shared across viewers: department pipeline order, then Bay name within a department. */
export function byBayDepartmentPipeline(left: BaySchedule, right: BaySchedule): number {
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
  bay: BaySchedule;
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
 * The Work Slot a Bay is actively running today, or null when the Bay is idle, free, or off. Projected
 * Work Slots span closure days, so this gates on the Bay's working calendar (mirrors the off-day branch
 * of {@link getBayTodayOccupancy}) — a Slot covering an off-day today is not active.
 */
export function findActiveWorkSlot({
  bay,
  today,
  workingCalendar,
}: {
  bay: BaySchedule;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): ProjectedWorkJobSlot | null {
  const occupancy = getBayTodayOccupancy({ bay, today, workingCalendar });

  return occupancy.kind === 'work' ? occupancy.slot : null;
}

/**
 * Future Work Slots in queue order — everything still ahead of today (half-open `endDate > today`),
 * optionally excluding the active Slot. A Slot covering today that the off-day gate excluded from
 * "active" still appears here, so it is never silently dropped.
 */
export function listUpcomingWorkSlots({
  bay,
  excludeSlotId,
  today,
}: {
  bay: BaySchedule;
  excludeSlotId?: string;
  today: DateOnlyIso;
}): ProjectedWorkJobSlot[] {
  return bay.slots.filter(
    (slot): slot is ProjectedWorkJobSlot => slot.kind === 'work' && slot.id !== excludeSlotId && slot.endDate > today,
  );
}

export type WorkSlotSpan = {
  /** Inclusive last working day — the day before the half-open `endDate`. */
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
    lastWorkDay: addDateOnlyDays(slot.endDate, -1),
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
  bay: BaySchedule;
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
export function getJobProjectedFinishDates(bays: readonly BaySchedule[]): Map<UUID, DateOnlyIso> {
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
  bays: readonly BaySchedule[];
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
  offDays,
  today,
}: {
  bays: readonly BaySchedule[];
  offDays: readonly OffDay[];
  today: DateOnlyIso;
}): BayLoadToday {
  const workingCalendarsByBayId = bayWorkingCalendars(bays, offDays);
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
