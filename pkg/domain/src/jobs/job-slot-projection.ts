import { addMinutes, max, startOfDay } from 'date-fns';

export const WORKING_DAY_MINUTES = 480;
const CALENDAR_DAY_MINUTES = 24 * 60;

export type ProjectableJobSlot = {
  durationMinutes: number;
  id: string;
  sequence: number;
};

export type ProjectedSlot<TSlot extends ProjectableJobSlot> = TSlot & {
  endAt: Date;
  startAt: Date;
};

export type SlotProjectionResult<TSlot extends ProjectableJobSlot> = {
  nextAvailableAt: Date;
  slots: ProjectedSlot<TSlot>[];
};

export function projectJobSlots<TSlot extends ProjectableJobSlot>({
  scheduleOrigin,
  schedulingFloor,
  slots,
}: {
  scheduleOrigin: Date;
  schedulingFloor?: Date;
  slots: readonly TSlot[];
}): SlotProjectionResult<TSlot> {
  let cursor = max([startOfDay(scheduleOrigin), startOfDay(schedulingFloor ?? new Date())]);

  const projectedSlots = [...slots]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .map((slot) => {
      const startAt = cursor;
      const endAt = addJobSlotDuration(startAt, slot.durationMinutes);
      cursor = endAt;

      return {
        ...slot,
        startAt,
        endAt,
      };
    });

  return {
    nextAvailableAt: cursor,
    slots: projectedSlots,
  };
}

export function addJobSlotDuration(startAt: Date, durationMinutes: number): Date {
  return addMinutes(startAt, (durationMinutes / WORKING_DAY_MINUTES) * CALENDAR_DAY_MINUTES);
}
