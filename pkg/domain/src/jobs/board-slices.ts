import {
  type BayListInput,
  BaySchedule,
  type DateOnlyIso,
  type JobDepartmentSchedule,
  type JobSchedulePreviewInput,
  type JobScheduleState,
  type ProjectedIdleJobSlot,
  type ProjectedWorkJobSlot,
  type UUID,
} from '@pkg/schema';

import { addDateOnlyDays } from '../formatting/date-only.js';
import { JOB_DEPARTMENT_PIPELINE } from './job-department-pipeline.js';

const SCHEDULE_HISTORY_WINDOW_DAYS = 365;

type ActiveBoardWindowSlot =
  | Pick<ProjectedWorkJobSlot, 'endDate' | 'jobId' | 'jobUnfinished' | 'kind'>
  | Pick<ProjectedIdleJobSlot, 'endDate' | 'jobId' | 'kind'>;

export function resolveBoardWindowFrom(
  input: BayListInput | JobSchedulePreviewInput | undefined,
  today: DateOnlyIso,
): DateOnlyIso {
  const earliestFrom = addDateOnlyDays(today, -SCHEDULE_HISTORY_WINDOW_DAYS);
  const requestedFrom = input?.from ?? today;

  return requestedFrom < earliestFrom ? earliestFrom : requestedFrom;
}

export function windowActiveBoard<TSlot extends ActiveBoardWindowSlot, TBay extends { slots: readonly TSlot[] }>(
  bays: readonly TBay[],
  {
    from,
    today,
  }: {
    from: DateOnlyIso;
    today: DateOnlyIso;
  },
): TBay[] {
  return bays.map(
    (bay) =>
      ({
        ...bay,
        slots: bay.slots.filter((slot) => isSlotInWindow(slot, { from, today })),
      }) as TBay,
  );
}

function isSlotInWindow(
  slot: ActiveBoardWindowSlot,
  { from, today }: { from: DateOnlyIso; today: DateOnlyIso },
): boolean {
  // Every Slot of a Job that still has an unfinished Work Slot stays, even far in the past.
  if (slot.kind === 'work' && slot.jobUnfinished) return true;
  // History widening: the Gantt lowers `from` below today.
  if (from < today) return slot.endDate >= from;
  // Slot spans are half-open; `endDate === today` has already left the default Active Board.
  return slot.endDate > today;
}

export function sliceJobSchedule(bays: readonly BaySchedule[], jobId: UUID): JobDepartmentSchedule[] {
  return JOB_DEPARTMENT_PIPELINE.map(({ department }) => ({
    department,
    bays: bays
      .filter((bay) => bay.department === department)
      .map((bay) =>
        BaySchedule.parse({
          ...bay,
          slots: bay.slots.filter((slot) => slot.kind === 'work' && slot.jobId === jobId),
        }),
      )
      .filter((bay) => bay.slots.length > 0),
  }));
}

export function foldJobScheduleStates(
  bays: readonly BaySchedule[],
  jobIds: readonly UUID[],
): Map<UUID, JobScheduleState> {
  const states = new Map<UUID, JobScheduleState>(
    jobIds.map((jobId) => [jobId, { active: 0, done: 0, endDate: null, scheduled: 0, startDate: null, total: 0 }]),
  );

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind !== 'work') continue;
      const state = states.get(slot.jobId);
      if (!state) continue;

      state[slot.state] += 1;
      state.total += 1;
      // Earliest Slot start / latest Slot end across every Bay the Job spans.
      state.startDate = state.startDate === null || slot.startDate < state.startDate ? slot.startDate : state.startDate;
      state.endDate = state.endDate === null || slot.endDate > state.endDate ? slot.endDate : state.endDate;
    }
  }

  return states;
}

export function getScheduleJobIds(bays: readonly { slots: readonly ActiveBoardWindowSlot[] }[]): UUID[] {
  const jobIds = new Set<UUID>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work') {
        jobIds.add(slot.jobId);
      }
    }
  }

  return [...jobIds];
}
