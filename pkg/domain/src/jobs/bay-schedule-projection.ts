import {
  type BayCalendarExceptionDirection,
  type BaySchedule,
  DateOnlyIso,
  type JobSlotMoveDirection,
  type ProjectedJobSlot,
} from '@pkg/schema';

import { type InsertAtDatePlacement, resolveInsertAtDatePlacement } from './job-slot-insert-at-date.js';
import { addJobSlotDuration, type ProjectableJobSlot, projectJobSlots } from './job-slot-projection.js';
import type { WorkingCalendar } from './working-calendar.js';

type OffDayFact = { date: string };
type CalendarExceptionFact = { date: string; direction: BayCalendarExceptionDirection };

/** One Bay's effective calendar: org Off-Days overlaid with the Bay's Calendar Exceptions. */
export function bayWorkingCalendar(
  orgOffDays: ReadonlySet<string>,
  calendarExceptions: readonly CalendarExceptionFact[],
): WorkingCalendar {
  return {
    bayExceptions: new Map(calendarExceptions.map((exception) => [exception.date, exception.direction] as const)),
    orgOffDays,
  };
}

/** Builds the effective WorkingCalendar for every Bay, sharing one org Off-Day set across Bays. */
export function bayWorkingCalendars<TBay extends { id: string; calendarExceptions: readonly CalendarExceptionFact[] }>(
  bays: readonly TBay[],
  offDays: readonly OffDayFact[],
): Map<string, WorkingCalendar> {
  const orgOffDays = new Set(offDays.map((offDay) => offDay.date));

  return new Map(bays.map((bay) => [bay.id, bayWorkingCalendar(orgOffDays, bay.calendarExceptions)] as const));
}

/** Projects a Bay Queue from its facts, building the effective calendar from Off-Days and Exceptions. */
export function projectBaySchedule<TSlot extends ProjectableJobSlot>({
  calendarExceptions = [],
  offDays = [],
  scheduleOrigin,
  slots,
}: {
  calendarExceptions?: readonly CalendarExceptionFact[];
  offDays?: readonly OffDayFact[];
  scheduleOrigin: DateOnlyIso;
  slots: readonly TSlot[];
}) {
  const workingCalendar = bayWorkingCalendar(new Set(offDays.map((offDay) => offDay.date)), calendarExceptions);

  return projectJobSlots({ scheduleOrigin, slots, workingCalendar });
}

export type BayPlacement = InsertAtDatePlacement<ProjectedJobSlot>;
export type BayPlacementType = BayPlacement['type'];

/** Marks a real Slot rendered as two halves around an inserted seed; halves keep the source Slot id. */
export type BaySlotSplitMarker = { sourceSlotId: string; half: 'before' | 'after' };

/** A Bay Queue slot in a preview: a real Slot, optionally one half of a split target. */
export type PreviewBaySlot = ProjectedJobSlot & { splitOf?: BaySlotSplitMarker };

/** A pending seed projected as a client-only Slot against the live queue. */
export type PreviewGhostSlot = {
  durationDays: number;
  endDate: DateOnlyIso;
  placementType: BayPlacementType;
  seedIndex: number;
  startDate: DateOnlyIso;
};

export type BayScheduleSeed = {
  /** A non-positive or non-integer (NaN-until-typed) duration produces no ghost. */
  durationDays: number;
  /** DatePicker raw value; `''` or unparsable means a plain append. */
  startDate: string;
};

export type BayPreviewOp =
  | { kind: 'moveSlot'; slotId: string; direction: JobSlotMoveDirection }
  | { kind: 'insertSeeds'; seeds: readonly BayScheduleSeed[]; today: DateOnlyIso };

export type BayPreviewResult = {
  /** False when the op left this Bay's queue untouched, so callers can keep the same reference. */
  changed: boolean;
  ghosts: PreviewGhostSlot[];
  nextAvailableDate: DateOnlyIso;
  /** Resolved placement per inserted seed, in seed order. Meaningful for real-Slot targets (single bookings). */
  placements: BayPlacement[];
  slots: PreviewBaySlot[];
};

/**
 * Previews a hypothetical mutation of one Bay Queue against its live projection, without touching the
 * stored queue. `moveSlot` reflows a reorder; `insertSeeds` resolves each seed's Insert-at-Date
 * placement (the same shared resolver the server booking uses), splits a target Slot into before/after
 * halves marked with `splitOf`, and reprojects. Display mapping — synthetic ids, render markers — is
 * left to the caller.
 */
export function previewBaySchedule(
  bay: BaySchedule,
  offDays: readonly OffDayFact[],
  op: BayPreviewOp,
): BayPreviewResult {
  const workingCalendar = bayWorkingCalendar(new Set(offDays.map((offDay) => offDay.date)), bay.calendarExceptions);

  return op.kind === 'moveSlot'
    ? previewSlotMove(bay, workingCalendar, op)
    : previewSeedInserts(bay, workingCalendar, op);
}

type ProjectableBaySlot = Omit<ProjectedJobSlot, 'endDate' | 'startDate'>;

function unprojected(bay: BaySchedule): ProjectableBaySlot[] {
  return bay.slots.map(({ endDate: _endDate, startDate: _startDate, ...slot }) => ({ ...slot }));
}

function unchanged(bay: BaySchedule): BayPreviewResult {
  return {
    changed: false,
    ghosts: [],
    nextAvailableDate: bay.nextAvailableDate,
    placements: [],
    slots: bay.slots,
  };
}

function previewSlotMove(
  bay: BaySchedule,
  workingCalendar: WorkingCalendar,
  op: { slotId: string; direction: JobSlotMoveDirection },
): BayPreviewResult {
  const slots = unprojected(bay);
  const slotIndex = slots.findIndex((slot) => slot.id === op.slotId);
  if (slotIndex < 0) {
    return unchanged(bay);
  }

  const targetIndex = slotIndex + (op.direction === 'left' ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= slots.length) {
    return unchanged(bay);
  }

  const currentSlot = slots[slotIndex];
  const adjacentSlot = slots[targetIndex];
  if (!currentSlot || !adjacentSlot) {
    return unchanged(bay);
  }

  const currentSequence = currentSlot.sequence;
  currentSlot.sequence = adjacentSlot.sequence;
  adjacentSlot.sequence = currentSequence;

  const projection = projectJobSlots<ProjectableBaySlot>({
    scheduleOrigin: bay.scheduleOrigin,
    slots,
    workingCalendar,
  });

  return {
    changed: true,
    ghosts: [],
    nextAvailableDate: projection.nextAvailableDate,
    placements: [],
    slots: projection.slots as PreviewBaySlot[],
  };
}

type GhostEntryMeta = {
  seedIndex: number;
  placementType: BayPlacementType;
  /** The resolver's append start, kept to clamp a trailing ghost past a stale queue end. */
  appendStart: DateOnlyIso | null;
};

type WorkingEntry =
  | (ProjectableBaySlot & { ghostMeta?: undefined; splitOf?: BaySlotSplitMarker })
  | { durationDays: number; ghostMeta: GhostEntryMeta; id: string; sequence: number; splitOf?: undefined };

function previewSeedInserts(
  bay: BaySchedule,
  workingCalendar: WorkingCalendar,
  op: { seeds: readonly BayScheduleSeed[]; today: DateOnlyIso },
): BayPreviewResult {
  const baySeeds = op.seeds
    .map((seed, seedIndex) => ({ seed, seedIndex }))
    .filter(({ seed }) => isValidSeedDuration(seed.durationDays));

  if (baySeeds.length === 0) {
    return unchanged(bay);
  }

  let entries: WorkingEntry[] = unprojected(bay);
  const placements: BayPlacement[] = [];

  for (const { seed, seedIndex } of baySeeds) {
    const result = spliceSeedEntry({
      entries,
      scheduleOrigin: bay.scheduleOrigin,
      seed,
      seedIndex,
      today: op.today,
      workingCalendar,
    });
    entries = result.entries;
    placements.push(result.placement);
  }

  const projection = projectJobSlots<WorkingEntry>({
    scheduleOrigin: bay.scheduleOrigin,
    slots: entries,
    workingCalendar,
  });
  const slots: PreviewBaySlot[] = [];
  const ghosts: PreviewGhostSlot[] = [];

  for (const [index, projected] of projection.slots.entries()) {
    if (!projected.ghostMeta) {
      const { ghostMeta: _ghostMeta, ...slot } = projected;
      slots.push(slot as PreviewBaySlot);
      continue;
    }

    // A trailing append ghost clamps forward when the queue ended in the past: the server fills that
    // gap with idle, so the previewed work Slot never starts stale.
    const isTrailing = index === projection.slots.length - 1;
    const clampedStart =
      isTrailing && projected.ghostMeta.appendStart && projected.ghostMeta.appendStart > projected.startDate
        ? projected.ghostMeta.appendStart
        : projected.startDate;

    ghosts.push({
      durationDays: projected.durationDays,
      endDate:
        clampedStart === projected.startDate
          ? projected.endDate
          : addJobSlotDuration(clampedStart, projected.durationDays, workingCalendar),
      placementType: projected.ghostMeta.placementType,
      seedIndex: projected.ghostMeta.seedIndex,
      startDate: clampedStart,
    });
  }

  return { changed: true, ghosts, nextAvailableDate: projection.nextAvailableDate, placements, slots };
}

function isValidSeedDuration(durationDays: number): boolean {
  return Number.isInteger(durationDays) && durationDays >= 1;
}

function spliceSeedEntry({
  entries,
  scheduleOrigin,
  seed,
  seedIndex,
  today,
  workingCalendar,
}: {
  entries: WorkingEntry[];
  scheduleOrigin: DateOnlyIso;
  seed: BayScheduleSeed;
  seedIndex: number;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): { entries: WorkingEntry[]; placement: BayPlacement } {
  const pickedDate = DateOnlyIso.safeParse(seed.startDate);
  const placement = resolveInsertAtDatePlacement({
    currentDate: today,
    pickedDate: pickedDate.success ? pickedDate.data : undefined,
    scheduleOrigin,
    slots: entries,
    workingCalendar,
  });
  const ghostEntry: WorkingEntry = {
    durationDays: seed.durationDays,
    ghostMeta: {
      appendStart: placement.type === 'append' ? placement.startDate : null,
      placementType: placement.type,
      seedIndex,
    },
    id: `seed:${seedIndex}`,
    sequence: entries.length + 1,
  };
  const next = [...entries];

  if (placement.type === 'append') {
    next.push(ghostEntry);
  } else {
    const targetIndex = next.findIndex((entry) => entry.id === placement.targetSlot.id);
    const target = targetIndex >= 0 ? next[targetIndex] : undefined;

    if (!target) {
      next.push(ghostEntry);
    } else if (placement.type === 'insert-before' || target.ghostMeta) {
      // Splitting another ghost has no real Slot to halve; degrade to insert-before.
      next.splice(targetIndex, 0, ghostEntry);
    } else {
      next.splice(
        targetIndex,
        1,
        { ...target, durationDays: placement.beforeDays, splitOf: { half: 'before', sourceSlotId: target.id } },
        ghostEntry,
        { ...target, durationDays: placement.afterDays, splitOf: { half: 'after', sourceSlotId: target.id } },
      );
    }
  }

  // Renumbering keeps projectJobSlots' sort deterministic (it tiebreaks equal sequences by id, which
  // would otherwise shuffle the split halves around the ghost).
  return {
    entries: next.map((entry, index) => ({ ...entry, sequence: index + 1 })),
    // A single booking always targets a real Slot, so the runtime shape is a BayPlacement; the
    // internal entry union only widens the static type.
    placement: placement as unknown as BayPlacement,
  };
}
