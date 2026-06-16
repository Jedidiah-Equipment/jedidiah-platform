import { previewBaySchedule } from '@pkg/domain';
import type { BaySchedule, JobSlotMoveDirection, OffDay } from '@pkg/schema';

export function moveBaySlotForDisplay(
  bays: BaySchedule[],
  offDays: OffDay[],
  slotId: string,
  direction: JobSlotMoveDirection,
): BaySchedule[] {
  let moved = false;

  const nextBays = bays.map((bay): BaySchedule => {
    const result = previewBaySchedule(bay, offDays, { direction, kind: 'moveSlot', slotId });
    if (!result.changed) {
      return bay;
    }

    moved = true;

    return { ...bay, nextAvailableDate: result.nextAvailableDate, slots: result.slots as BaySchedule['slots'] };
  });

  return moved ? nextBays : bays;
}
