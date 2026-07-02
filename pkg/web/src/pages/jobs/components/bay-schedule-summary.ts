import {
  DEFAULT_IDLE_SLOT_LABEL,
  type SlotCalendarDays,
  summarizeSlotCalendarDays,
  type WorkingCalendar,
} from '@pkg/domain';
import type { BaySchedule, DateOnlyIso, ProjectedJobSlot } from '@pkg/schema';

export function getSlotLabel(slot: ProjectedJobSlot): string {
  return slot.kind === 'idle' ? (slot.label ?? DEFAULT_IDLE_SLOT_LABEL) : slot.jobCode;
}

export type JobScheduleSummary = {
  currentOperator: BaySchedule['currentOperator'];
  dayBreakdown: SlotCalendarDays;
  endDate: DateOnlyIso;
  startDate: DateOnlyIso;
};

// Locate the booked work slot for a job and summarize its calendar days, so the job aside
// can show the same schedule breakdown the gantt slot bar computes. When a bay is given,
// the matching bay's slot is used — a job can be booked in several bays — otherwise the
// first booked slot found across bays wins.
export function findJobScheduleSummary(
  bays: BaySchedule[],
  workingCalendarsByBayId: ReadonlyMap<string, WorkingCalendar>,
  jobId: string,
  bayId?: string | undefined,
): JobScheduleSummary | null {
  for (const bay of bays) {
    if (bayId !== undefined && bay.id !== bayId) {
      continue;
    }

    for (const slot of bay.slots) {
      if (slot.kind !== 'work' || slot.jobId !== jobId) {
        continue;
      }

      const workingCalendar = workingCalendarsByBayId.get(bay.id) ?? {};

      return {
        currentOperator: bay.currentOperator,
        dayBreakdown: summarizeSlotCalendarDays(slot.startDate, slot.endDate, workingCalendar),
        endDate: slot.endDate,
        startDate: slot.startDate,
      };
    }
  }

  return null;
}
