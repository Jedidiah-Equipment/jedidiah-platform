import { addMinutes, max, startOfDay } from 'date-fns';

export const WORKING_DAY_MINUTES = 480;

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
  let cursor = max([scheduleOrigin, startOfDay(schedulingFloor ?? new Date())]);

  const projectedSlots = [...slots]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .map((slot) => {
      const startAt = cursor;
      const endAt = addMinutes(startAt, slot.durationMinutes);
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
