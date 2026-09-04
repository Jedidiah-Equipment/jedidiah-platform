import type { DateIso, DateOnlyIso } from '@pkg/schema';
import type { JobDepartmentTiming, WorkItemDepartment } from '@pkg/schema/equipment';
import { formatDate, toPlantDateOnly } from '../../formatting/date.js';
import { addDateOnlyDays } from '../../formatting/date-only.js';
import { departmentLabels } from '../departments.js';
import { countWorkingDaysBetween, type WorkingCalendar } from './working-calendar.js';

export type DepartmentTimingState = 'not-started' | 'in-progress' | 'complete';

export const DEPARTMENT_TIMING_STATUS = {
  'not-started': { color: 'gray', label: 'Not started' },
  'in-progress': { color: 'yellow', label: 'In progress' },
  complete: { color: 'green', label: 'Complete' },
} as const;

/**
 * Inclusive elapsed working days between the two stamp days: started Monday, done Wednesday
 * reads 3, and a same-day span reads 1, matching how a 1-day Slot reads. Uses the org
 * working calendar only — bay exceptions belong to scheduling, and a stamp is not a Slot.
 */
export function timingWorkingDays(
  startedOn: DateOnlyIso,
  completedOn: DateOnlyIso,
  workingCalendar: WorkingCalendar,
): number {
  return Math.max(1, countWorkingDaysBetween(startedOn, addDateOnlyDays(completedOn, 1), workingCalendar));
}

/** Shared state and headline for the web and mobile Department Timing cards. */
export function getDepartmentTimingPresentation({
  department,
  timing,
  today,
  workingCalendar,
}: {
  department: WorkItemDepartment;
  timing: Pick<JobDepartmentTiming, 'completedAt' | 'startedAt'>;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): {
  durationDays: number | null;
  headline: string;
  state: DepartmentTimingState;
} {
  const departmentLabel = departmentLabels[department];

  if (timing.startedAt === null) {
    return { durationDays: null, headline: `${departmentLabel} has not started`, state: 'not-started' };
  }

  if (timing.completedAt === null) {
    const startedOn = timingDateOnly(timing.startedAt);
    const when = startedOn === today ? 'today' : formatDate(timing.startedAt, 'short');

    return { durationDays: null, headline: `${departmentLabel} started ${when}`, state: 'in-progress' };
  }

  const durationDays = timingWorkingDays(
    timingDateOnly(timing.startedAt),
    timingDateOnly(timing.completedAt),
    workingCalendar,
  );

  return {
    durationDays,
    headline: `${departmentLabel} took ${durationDays} ${durationDays === 1 ? 'day' : 'days'}`,
    state: 'complete',
  };
}

function timingDateOnly(value: DateIso): DateOnlyIso {
  return toPlantDateOnly(new Date(value));
}
