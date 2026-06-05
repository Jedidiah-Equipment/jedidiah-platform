import { addDays, startOfDay } from 'date-fns';

export const DEFAULT_IDLE_SLOT_LABEL = 'Idle';

export type ProjectableJobSlot = {
  durationDays: number;
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
  slots,
}: {
  scheduleOrigin: Date;
  slots: readonly TSlot[];
}): SlotProjectionResult<TSlot> {
  let cursor = startOfDay(scheduleOrigin);

  const projectedSlots = [...slots]
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .map((slot) => {
      const startAt = cursor;
      const endAt = addJobSlotDuration(startAt, slot.durationDays);
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

export function addJobSlotDuration(startAt: Date, durationDays: number): Date {
  return addDays(startAt, durationDays);
}
