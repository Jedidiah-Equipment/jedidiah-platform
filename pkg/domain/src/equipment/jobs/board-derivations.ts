import type {
  DateOnlyIso,
  Department,
  OffDay,
  ProjectedBayQueue,
  ProjectedIdleJobSlot,
  ProjectedJobSlot,
  ProjectedWorkJobSlot,
  UUID,
} from '@pkg/schema';

import { addDateOnlyDays, endOfDateOnlyWeek } from '../../formatting/date-only.js';
import { JOB_DEPARTMENT_PIPELINE } from './job-department-pipeline.js';
import { isWorkingDay, type WorkingCalendar } from './working-calendar.js';

// Pure derivations over projected Bay Queues (`jobs.listBays`), shared by the web shop-floor
// dashboard widgets and the mobile Bay screens. Disabled Bays are excluded everywhere; callers filter
// through listEnabledBays before deriving.

export const BAY_RUNWAY_CAP_WORKING_DAYS = 30;

export function listEnabledBays(bays: readonly ProjectedBayQueue[]): ProjectedBayQueue[] {
  return bays.filter((bay) => bay.disabledAt === null);
}

const bayDepartmentOrder = new Map(JOB_DEPARTMENT_PIPELINE.map((step, index) => [step.department, index] as const));

/** Bay ordering shared across viewers: department pipeline order, then Bay name within a department. */
export function byBayDepartmentPipeline(
  left: Pick<ProjectedBayQueue, 'department' | 'name'>,
  right: Pick<ProjectedBayQueue, 'department' | 'name'>,
): number {
  const order =
    (bayDepartmentOrder.get(left.department) ?? Number.MAX_SAFE_INTEGER) -
    (bayDepartmentOrder.get(right.department) ?? Number.MAX_SAFE_INTEGER);

  return order !== 0 ? order : left.name.localeCompare(right.name);
}

export type BayDepartmentGroup<TBay> = {
  bays: TBay[];
  department: Department;
};

/**
 * Splits Bays into the Department headings every Board viewer reads top to bottom, in the fixed
 * pipeline order. Bays keep the order they arrive in within a heading, so a caller that has already
 * sorted them — by name on the web Board, by the sort control on mobile Plan — still decides it.
 * A Department with no Bay gets no heading, and each Department appears at most once even if it is
 * missing from the pipeline.
 */
export function groupBaysByDepartmentPipeline<TBay extends Pick<ProjectedBayQueue, 'department'>>(
  bays: readonly TBay[],
): BayDepartmentGroup<TBay>[] {
  const byDepartment = new Map<Department, TBay[]>();

  for (const bay of bays) {
    const group = byDepartment.get(bay.department);

    if (group) group.push(bay);
    else byDepartment.set(bay.department, [bay]);
  }

  // Pipeline order first; a Department the pipeline does not name still gets its Bays, listed after.
  const ordered = [...byDepartment.keys()].sort(
    (left, right) =>
      (bayDepartmentOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (bayDepartmentOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
  );

  return ordered.map((department) => ({ bays: byDepartment.get(department) ?? [], department }));
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

/** The immediate next Work Slot on each Bay, matching the planning Gantt's queue semantics. */
export function listNextWorkSlots(bays: readonly ProjectedBayQueue[]): ProjectedWorkJobSlot[] {
  const slots: ProjectedWorkJobSlot[] = [];

  for (const bay of bays) {
    const activeIndex = bay.slots.findIndex((slot) => slot.state === 'active');
    const nextSlot =
      activeIndex === -1 ? bay.slots.find((slot) => slot.state === 'scheduled') : bay.slots[activeIndex + 1];

    // An Idle Slot can be next on the Bay; Work Jobs after it must remain neutral.
    if (nextSlot?.kind === 'work') slots.push(nextSlot);
  }

  return slots;
}

/** Job ids represented by the next Work Slot on one or more Bays. */
export function getNextJobIds(bays: readonly ProjectedBayQueue[]): Set<UUID> {
  return new Set(listNextWorkSlots(bays).map((slot) => slot.jobId));
}

export function getOffDayLabel(offDays: readonly OffDay[], date: DateOnlyIso): string | null {
  return offDays.find((offDay) => offDay.date === date)?.label ?? null;
}

export type BayRunway = {
  bayId: UUID;
  label: string;
  /** Remaining working days in the Work Slot that is currently underway. */
  inProgressWorkDays: number;
  /** A scheduled Work Slot extends beyond the cap window. */
  overflow: boolean;
  scheduledWorkDays: number;
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
  let inProgressWorkDays = 0;
  let scheduledWorkDays = 0;

  while (counted < capWorkingDays) {
    if (isWorkingDay(cursor, workingCalendar)) {
      const slot = findSlotCoveringDate(bay.slots, cursor);

      if (slot?.kind === 'work' && slot.state === 'active') {
        inProgressWorkDays += 1;
      } else if (slot?.kind === 'work' && slot.state === 'scheduled') {
        scheduledWorkDays += 1;
      }

      counted += 1;
    }

    cursor = addDateOnlyDays(cursor, 1);
  }

  // After the loop, cursor is the calendar day after the cap's last working day; a slot
  // whose half-open end extends past it still has booked days beyond the window.
  return {
    bayId: bay.id,
    inProgressWorkDays,
    label: bay.currentOperator?.name ?? bay.name,
    overflow: bay.slots.some((slot) => slot.kind === 'work' && slot.state !== 'done' && slot.endDate > cursor),
    scheduledWorkDays,
  };
}

/** Each Job's latest-ending Work Slot across the given Bays. */
function getLatestWorkSlots(bays: readonly ProjectedBayQueue[]): Map<UUID, ProjectedWorkJobSlot> {
  const latestSlots = new Map<UUID, ProjectedWorkJobSlot>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind !== 'work') {
        continue;
      }

      const current = latestSlots.get(slot.jobId);

      if (!current || slot.endDate > current.endDate) {
        latestSlots.set(slot.jobId, slot);
      }
    }
  }

  return latestSlots;
}

/** A Job's projected finish: the last Work Slot end date across the given Bays. */
export function getJobProjectedFinishDates(bays: readonly ProjectedBayQueue[]): Map<UUID, DateOnlyIso> {
  return new Map([...getLatestWorkSlots(bays)].map(([jobId, slot]) => [jobId, slot.endDate]));
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

  for (const [, slot] of getLatestWorkSlots(bays)) {
    // Slot spans are half-open, so remaining work means the finish date is after today.
    if (slot.endDate <= today) {
      continue;
    }

    activeJobs += 1;

    if (slot.lastWorkDay <= weekEnd) {
      finishingThisWeek += 1;
    }
  }

  return { activeJobs, finishingThisWeek };
}

export type ScheduledJob = {
  bayId: UUID;
  bayName: string;
  jobId: UUID;
  /** Who is on that Bay today, or null while it has no operator — the Bay name already carries it. */
  operatorName: string | null;
  /** Earliest first working day across the Job's Slots — the day work is due to begin. */
  startDate: DateOnlyIso;
};

/**
 * Jobs booked onto a Bay but not yet started: every Work Slot is projected `scheduled`, so a Job with
 * any `active` or `done` Slot is already underway and drops out, and an unscheduled Job with no Slot
 * at all never appears. Ordered by the day work is due to begin, earliest first.
 */
export function listScheduledJobs({ bays }: { bays: readonly ProjectedBayQueue[] }): ScheduledJob[] {
  const startedJobIds = new Set<UUID>();
  const earliestSlots = new Map<UUID, { bay: ProjectedBayQueue; slot: ProjectedWorkJobSlot }>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind !== 'work') {
        continue;
      }

      if (slot.state !== 'scheduled') {
        startedJobIds.add(slot.jobId);
        continue;
      }

      const current = earliestSlots.get(slot.jobId);

      if (!current || slot.firstWorkDay < current.slot.firstWorkDay) {
        earliestSlots.set(slot.jobId, { bay, slot });
      }
    }
  }

  return [...earliestSlots]
    .filter(([jobId]) => !startedJobIds.has(jobId))
    .map(([jobId, { bay, slot }]) => ({
      bayId: bay.id,
      bayName: bay.name,
      jobId,
      operatorName: bay.currentOperator?.name ?? null,
      startDate: slot.firstWorkDay,
    }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.jobId.localeCompare(right.jobId));
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

export type DepartmentBayLoadToday = BayLoadToday & {
  department: Department;
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

export function computeBayLoadTodayByDepartment({
  bays,
  today,
  workingCalendarsByBayId,
}: {
  bays: readonly ProjectedBayQueue[];
  today: DateOnlyIso;
  workingCalendarsByBayId: ReadonlyMap<string, WorkingCalendar>;
}): DepartmentBayLoadToday[] {
  return groupBaysByDepartmentPipeline(bays).map(({ bays: departmentBays, department }) => ({
    ...computeBayLoadToday({ bays: departmentBays, today, workingCalendarsByBayId }),
    department,
  }));
}

function findSlotCoveringDate(slots: readonly ProjectedJobSlot[], date: DateOnlyIso): ProjectedJobSlot | null {
  return slots.find((slot) => slot.startDate <= date && date < slot.endDate) ?? null;
}
