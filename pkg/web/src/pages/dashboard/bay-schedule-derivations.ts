import { addDateOnlyDays, isWorkingDay, type WorkingCalendar } from '@pkg/domain';
import type {
  BaySchedule,
  DateOnlyIso,
  OffDay,
  ProjectedIdleJobSlot,
  ProjectedJobSlot,
  ProjectedWorkJobSlot,
  UUID,
} from '@pkg/schema';

import { createWorkingCalendarsByBayId } from '../jobs/components/bay-schedule-summary.js';

// Pure derivations over the cached Bay list query shared by the shop-floor dashboard
// widgets (and the deliveries at-risk join). Disabled Bays are excluded everywhere;
// callers filter through listEnabledBays before deriving.

export const BAY_RUNWAY_CAP_WORKING_DAYS = 30;

export function listEnabledBays(bays: readonly BaySchedule[]): BaySchedule[] {
  return bays.filter((bay) => bay.disabledAt === null);
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
  const weekEnd = getEndOfWeek(today);
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
  const workingCalendarsByBayId = createWorkingCalendarsByBayId([...bays], [...offDays]);
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

/** The Sunday ending the Monday-start week containing the given plant date. */
function getEndOfWeek(date: DateOnlyIso): DateOnlyIso {
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

  return addDateOnlyDays(date, dayOfWeek === 0 ? 0 : 7 - dayOfWeek);
}
