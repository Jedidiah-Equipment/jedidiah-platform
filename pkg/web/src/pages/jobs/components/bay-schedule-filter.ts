import type { DateOnlyIso, UUID } from '@pkg/schema';

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
  startDate: DateOnlyIso;
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
  today,
}: {
  bays: ReadonlyArray<{ id: UUID; slots: ReadonlyArray<FilterableSlotWithStart> }>;
  filter: BayScheduleFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
  /** Plant today as a yyyy-MM-dd business date, from the schedule read. */
  today: DateOnlyIso;
}): DateOnlyIso | null {
  let earliestStart: DateOnlyIso | null = null;
  let earliestFutureStart: DateOnlyIso | null = null;
  const shouldPreferFuture = filter.bayId !== null || filter.customerId !== null;

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (!slotMatchesBayScheduleFilter({ bayId: bay.id, filter, jobsById, slot })) {
        continue;
      }

      if (earliestStart === null || slot.startDate < earliestStart) {
        earliestStart = slot.startDate;
      }

      if (
        shouldPreferFuture &&
        slot.startDate >= today &&
        (earliestFutureStart === null || slot.startDate < earliestFutureStart)
      ) {
        earliestFutureStart = slot.startDate;
      }
    }
  }

  return earliestFutureStart ?? earliestStart;
}
