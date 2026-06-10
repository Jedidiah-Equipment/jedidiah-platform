import {
  DEFAULT_IDLE_SLOT_LABEL,
  type SlotCalendarDays,
  summarizeSlotCalendarDays,
  type WorkingCalendar,
} from '@pkg/domain';
import type { BaySchedule, OffDay, ProjectedJobSlot } from '@pkg/schema';

export function getSlotLabel(slot: ProjectedJobSlot): string {
  return slot.kind === 'idle' ? (slot.label ?? DEFAULT_IDLE_SLOT_LABEL) : slot.jobCode;
}

export function createWorkingCalendarsByBayId(bays: BaySchedule[], offDays: OffDay[]): Map<string, WorkingCalendar> {
  const orgOffDays = new Set(offDays.map((offDay) => offDay.date));

  return new Map(
    bays.map((bay) => [
      bay.id,
      {
        bayExceptions: new Map(
          bay.calendarExceptions.map((exception) => [exception.date, exception.direction] as const),
        ),
        orgOffDays,
      },
    ]),
  );
}

export type JobScheduleSummary = {
  currentOperator: BaySchedule['currentOperator'];
  dayBreakdown: SlotCalendarDays;
  endAt: Date;
  startAt: Date;
};

// Locate the booked work slot for a job and summarize its calendar days, so the job aside
// can show the same schedule breakdown the gantt slot bar computes. When a bay is given,
// the matching bay's slot is used — a job can be booked in several bays — otherwise the
// first booked slot found across bays wins.
export function findJobScheduleSummary(
  bays: BaySchedule[],
  offDays: OffDay[],
  jobId: string,
  bayId?: string | undefined,
): JobScheduleSummary | null {
  const workingCalendarsByBayId = createWorkingCalendarsByBayId(bays, offDays);

  for (const bay of bays) {
    if (bayId !== undefined && bay.id !== bayId) {
      continue;
    }

    for (const slot of bay.slots) {
      if (slot.kind !== 'work' || slot.jobId !== jobId) {
        continue;
      }

      const startAt = new Date(slot.startAt);
      const endAt = new Date(slot.endAt);
      const workingCalendar = workingCalendarsByBayId.get(bay.id) ?? {};

      return {
        currentOperator: bay.currentOperator,
        dayBreakdown: summarizeSlotCalendarDays(startAt, endAt, workingCalendar),
        endAt,
        startAt,
      };
    }
  }

  return null;
}
