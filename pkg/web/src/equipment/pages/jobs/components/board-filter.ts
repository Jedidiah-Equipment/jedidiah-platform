import type { DateOnlyIso, UUID } from '@pkg/schema';
import type { Department } from '@pkg/schema/equipment';

export type BoardFilter = {
  bayId: UUID | null;
  customerId: UUID | null;
  department: Department | null;
  jobId: UUID | null;
};

export const emptyBoardFilter: BoardFilter = {
  bayId: null,
  customerId: null,
  department: null,
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
  /** Null when the Job's machine is one we hold — Stock matches no Customer filter. */
  customerId: UUID | null;
};

export function hasActiveBoardFilter(filter: BoardFilter): boolean {
  return filter.bayId !== null || filter.customerId !== null || filter.department !== null || filter.jobId !== null;
}

// A slot matches only when it satisfies every active filter dimension. Idle
// slots have no job, so any active job/customer filter excludes them.
export function slotMatchesBoardFilter({
  bayDepartment,
  bayId,
  filter,
  jobsById,
  slot,
}: {
  bayDepartment: Department;
  bayId: UUID;
  filter: BoardFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
  slot: FilterableSlot;
}): boolean {
  if (filter.bayId !== null && bayId !== filter.bayId) {
    return false;
  }

  if (filter.department !== null && bayDepartment !== filter.department) {
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

/**
 * The Bay lanes a filtered Board still draws: those holding at least one matching slot. A filter
 * answers "where is this work", and a lane with nothing matching is noise between the answers —
 * the Board can run to forty lanes, so the two that match are otherwise pages apart. Lanes that
 * survive are drawn whole, dimmed neighbours included, because a Bay's queue is what makes the
 * match legible: when the slot runs, and what it sits between.
 */
export function selectBaysWithBoardFilterMatches<
  TBay extends { department: Department; id: UUID; slots: ReadonlyArray<FilterableSlot> },
>({
  bays,
  filter,
  jobsById,
}: {
  bays: readonly TBay[];
  filter: BoardFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
}): TBay[] {
  if (!hasActiveBoardFilter(filter)) {
    return [...bays];
  }

  return bays.filter((bay) =>
    bay.slots.some((slot) =>
      slotMatchesBoardFilter({
        bayDepartment: bay.department,
        bayId: bay.id,
        filter,
        jobsById,
        slot,
      }),
    ),
  );
}

export function countBoardFilterMatches({
  bays,
  filter,
  jobsById,
}: {
  bays: ReadonlyArray<{ department: Department; id: UUID; slots: ReadonlyArray<FilterableSlot> }>;
  filter: BoardFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
}): number {
  let count = 0;

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (
        slotMatchesBoardFilter({
          bayDepartment: bay.department,
          bayId: bay.id,
          filter,
          jobsById,
          slot,
        })
      ) {
        count += 1;
      }
    }
  }

  return count;
}

export function getEarliestBoardFilterMatchStart({
  bays,
  filter,
  jobsById,
  today,
}: {
  bays: ReadonlyArray<{ department: Department; id: UUID; slots: ReadonlyArray<FilterableSlotWithStart> }>;
  filter: BoardFilter;
  jobsById: ReadonlyMap<UUID, FilterableJob>;
  /** Plant today as a yyyy-MM-dd business date, from the Board read. */
  today: DateOnlyIso;
}): DateOnlyIso | null {
  let earliestStart: DateOnlyIso | null = null;
  let earliestFutureStart: DateOnlyIso | null = null;
  const shouldPreferFuture = filter.bayId !== null || filter.customerId !== null || filter.department !== null;

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (
        !slotMatchesBoardFilter({
          bayDepartment: bay.department,
          bayId: bay.id,
          filter,
          jobsById,
          slot,
        })
      ) {
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
