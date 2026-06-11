import { projectJobSlots } from '@pkg/domain';
import type { BaySchedule, JobSlotMoveDirection, OffDay, ProjectedJobSlot } from '@pkg/schema';

import { createWorkingCalendarsByBayId } from './bay-schedule-summary.js';

type ProjectableScheduleSlot = Omit<ProjectedJobSlot, 'endDate' | 'startDate'>;

export function moveBaySlotForDisplay(
  bays: BaySchedule[],
  offDays: OffDay[],
  slotId: string,
  direction: JobSlotMoveDirection,
): BaySchedule[] {
  const workingCalendarsByBayId = createWorkingCalendarsByBayId(bays, offDays);
  let moved = false;

  const nextBays = bays.map((bay): BaySchedule => {
    const slotIndex = bay.slots.findIndex((slot) => slot.id === slotId);
    if (slotIndex < 0) {
      return bay;
    }

    const targetIndex = slotIndex + (direction === 'left' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= bay.slots.length) {
      return bay;
    }

    moved = true;
    const reorderedSlots = bay.slots.map(({ endDate: _endDate, startDate: _startDate, ...slot }) => ({ ...slot }));
    const currentSlot = reorderedSlots[slotIndex];
    const adjacentSlot = reorderedSlots[targetIndex];
    if (!currentSlot || !adjacentSlot) {
      return bay;
    }

    const currentSequence = currentSlot.sequence;

    currentSlot.sequence = adjacentSlot.sequence;
    adjacentSlot.sequence = currentSequence;

    const projection = projectJobSlots<ProjectableScheduleSlot>({
      scheduleOrigin: bay.scheduleOrigin,
      slots: reorderedSlots,
      workingCalendar: workingCalendarsByBayId.get(bay.id) ?? {},
    });

    return {
      ...bay,
      nextAvailableDate: projection.nextAvailableDate as BaySchedule['nextAvailableDate'],
      slots: projection.slots as BaySchedule['slots'],
    };
  });

  return moved ? nextBays : bays;
}
