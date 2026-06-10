import type { UUID } from '@pkg/schema';
import { toJobDateKey } from './job-date-key.js';

export type BayScheduleFilter = {
  bayId: UUID | null;
  customerId: UUID | null;
  jobId: UUID | null;
};

export const emptyBayScheduleFilter: BayScheduleFilter = {
  bayId: null,
  customerId: null,
  jobId: null,
};

type FilterableSlot = {
  // Work slots carry the booked job id; idle slots carry null.
  jobId: UUID | null;
};

type FilterableSlotWithStart = FilterableSlot & {
  startAt: Date | string;
};

type FilterableJob = {
  customerId: UUID;
};

export function hasActiveBayScheduleFilter(filter: BayScheduleFilter): boolean {
  return filter.bayId !== null || filter.customerId !== null || filter.jobId !== null;
}

// A slot matches only when it satisfies every active filter dimension. Idle
// slots have no job, so any active job/customer filter excludes them.
export function slotMatchesBayScheduleFilter({
  bayId,
  filter,
  jobsById,
  slot,
}: {
  bayId: UUID;
  filter: BayScheduleFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
  slot: FilterableSlot;
}): boolean {
  if (filter.bayId !== null && bayId !== filter.bayId) {
    return false;
  }

  if (filter.jobId !== null && slot.jobId !== filter.jobId) {
    return false;
  }

  if (filter.customerId !== null) {
    if (slot.jobId === null) {
      return false;
    }

    const job = jobsById.get(slot.jobId);

    if ((job?.customerId ?? null) !== filter.customerId) {
      return false;
    }
  }

  return true;
}

export function countBayScheduleFilterMatches({
  bays,
  filter,
  jobsById,
}: {
  bays: ReadonlyArray<{ id: UUID; slots: ReadonlyArray<FilterableSlot> }>;
  filter: BayScheduleFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
}): number {
  let count = 0;

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slotMatchesBayScheduleFilter({ bayId: bay.id, filter, jobsById, slot })) {
        count += 1;
      }
    }
  }

  return count;
}

export function getEarliestBayScheduleFilterMatchStart({
  bays,
  filter,
  jobsById,
  today = new Date(),
}: {
  bays: ReadonlyArray<{ id: UUID; slots: ReadonlyArray<FilterableSlotWithStart> }>;
  filter: BayScheduleFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
  today?: Date;
}): Date | null {
  let earliestStart: Date | null = null;
  let earliestFutureStart: Date | null = null;
  const shouldPreferFuture = filter.bayId !== null || filter.customerId !== null;
  const todayDateKey = toJobDateKey(today);

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (!slotMatchesBayScheduleFilter({ bayId: bay.id, filter, jobsById, slot })) {
        continue;
      }

      const startAt = new Date(slot.startAt);

      if (earliestStart === null || startAt.getTime() < earliestStart.getTime()) {
        earliestStart = startAt;
      }

      if (
        shouldPreferFuture &&
        toJobDateKey(startAt) >= todayDateKey &&
        (earliestFutureStart === null || startAt.getTime() < earliestFutureStart.getTime())
      ) {
        earliestFutureStart = startAt;
      }
    }
  }

  return earliestFutureStart ?? earliestStart;
}
