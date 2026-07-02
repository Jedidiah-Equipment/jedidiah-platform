import type {
  BayCalendarExceptionDirection,
  DateOnlyIso,
  JobSlotState,
  ProjectedIdleJobSlot,
  ProjectedWorkJobSlot,
} from '@pkg/schema';

import { bayWorkingCalendars } from './bay-schedule-projection.js';
import { projectJobSlots } from './job-slot-projection.js';
import type { WorkingCalendar } from './working-calendar.js';

type OffDayFact = { date: string };
type CalendarExceptionFact = { date: string; direction: BayCalendarExceptionDirection };

export type ProjectableBoardWorkSlot = Omit<ProjectedWorkJobSlot, 'endDate' | 'jobUnfinished' | 'startDate' | 'state'>;
export type ProjectableBoardIdleSlot = Omit<ProjectedIdleJobSlot, 'endDate' | 'startDate' | 'state'>;
export type ProjectableBoardSlot = ProjectableBoardWorkSlot | ProjectableBoardIdleSlot;

export type BoardBayFacts = {
  id: string;
  scheduleOrigin: DateOnlyIso;
  calendarExceptions: readonly CalendarExceptionFact[];
  /** Stored queue facts in sequence order, with jobId/jobCode already resolved by the caller. */
  slots: readonly ProjectableBoardSlot[];
};

export type ProjectedBoardBay = {
  bayId: string;
  nextAvailableDate: DateOnlyIso;
  slots: (ProjectedWorkJobSlot | ProjectedIdleJobSlot)[];
  workingCalendar: WorkingCalendar;
};

export type ProjectedBoard = {
  bays: ProjectedBoardBay[];
};

export function projectBoard({
  bays,
  offDays,
  today,
}: {
  bays: readonly BoardBayFacts[];
  offDays: readonly OffDayFact[];
  today: DateOnlyIso;
}): ProjectedBoard {
  const workingCalendars = bayWorkingCalendars(bays, offDays);
  const projectedBays = bays.map((bay) => {
    const workingCalendar = workingCalendars.get(bay.id) ?? {};
    const projection = projectJobSlots({
      scheduleOrigin: bay.scheduleOrigin,
      slots: bay.slots,
      workingCalendar,
    });

    return {
      bayId: bay.id,
      nextAvailableDate: projection.nextAvailableDate,
      slots: projection.slots,
      workingCalendar,
    };
  });

  const unfinishedJobIds = new Set<string>();
  for (const bay of projectedBays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work' && slot.endDate > today) {
        unfinishedJobIds.add(slot.jobId);
      }
    }
  }

  return {
    bays: projectedBays.map((bay) => ({
      ...bay,
      slots: bay.slots.map((slot) => {
        const state = slotState(slot, today);

        return slot.kind === 'work'
          ? { ...slot, jobUnfinished: unfinishedJobIds.has(slot.jobId), state }
          : { ...slot, state };
      }),
    })),
  };
}

export function slotState(
  slot: Pick<ProjectedWorkJobSlot | ProjectedIdleJobSlot, 'endDate' | 'startDate'>,
  today: DateOnlyIso,
): JobSlotState {
  if (slot.endDate <= today) return 'done';
  if (slot.startDate <= today) return 'active';

  return 'scheduled';
}
