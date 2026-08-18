import type { DateIso, DateOnlyIso, JobDepartmentTiming } from '@pkg/schema';

import { formatDate, toPlantDateOnly } from '../formatting/date.js';
import { addDateOnlyDays } from '../formatting/date-only.js';
import { countWorkingDaysBetween, type WorkingCalendar } from './working-calendar.js';

export type FabricationTimingState = 'not-started' | 'in-progress' | 'complete';

export const FABRICATION_TIMING_STATUS = {
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

/** Shared state and headline for the web and mobile Fabrication timing cards. */
export function getFabricationTimingPresentation({
  timing,
  today,
  workingCalendar,
}: {
  timing: Pick<JobDepartmentTiming, 'completedAt' | 'startedAt'>;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): {
  durationDays: number | null;
  headline: string;
  state: FabricationTimingState;
} {
  if (timing.startedAt === null) {
    return { durationDays: null, headline: 'Fabrication has not started', state: 'not-started' };
  }

  if (timing.completedAt === null) {
    const startedOn = timingDateOnly(timing.startedAt);
    const when = startedOn === today ? 'today' : formatDate(timing.startedAt, 'short');

    return { durationDays: null, headline: `Fabrication started ${when}`, state: 'in-progress' };
  }

  const durationDays = timingWorkingDays(
    timingDateOnly(timing.startedAt),
    timingDateOnly(timing.completedAt),
    workingCalendar,
  );

  return {
    durationDays,
    headline: `Fabrication took ${durationDays} ${durationDays === 1 ? 'day' : 'days'}`,
    state: 'complete',
  };
}

function timingDateOnly(value: DateIso): DateOnlyIso {
  return toPlantDateOnly(new Date(value));
}
