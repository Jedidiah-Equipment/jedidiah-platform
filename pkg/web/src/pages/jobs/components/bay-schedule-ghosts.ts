import {
  addJobSlotDuration,
  firstWorkingDayOnOrAfter,
  maxDateOnly,
  projectJobSlots,
  resolveInsertAtDatePlacement,
  type WorkingCalendar,
} from '@pkg/domain';
import { type BaySchedule, DateOnlyIso, type OffDay, type ProjectedJobSlot, type UUID } from '@pkg/schema';

import { sortBaysByDepartmentPipeline } from '@/components/bays/sort-bays.js';

import { createWorkingCalendarsByBayId } from './bay-schedule-summary.js';

export type BayScheduleGhostSeed = {
  bayId: UUID;
  /** Rows with a non-positive or non-integer (NaN-until-typed) duration produce no ghost. */
  durationDays: number;
  /** DatePicker raw value; `''` or unparsable means plain append. */
  startDate: string;
};

export type SplitHalfMarker = { sourceSlotId: string; half: 'before' | 'after' };

/**
 * A Bay schedule slot as displayed in the ghost preview: real slots flow through
 * unchanged, while a slot split by a ghost renders as two halves carrying a marker
 * and a suffixed synthetic id (`:before` / `:after`) that must never reach a mutation.
 */
export type DisplayBaySlot = ProjectedJobSlot & { previewSplit?: SplitHalfMarker };
export type DisplayBaySchedule = Omit<BaySchedule, 'slots'> & { slots: DisplayBaySlot[] };

export type GhostSlot = {
  /** `ghost:${bayId}:${seedIndex}` — stable render key, never a real slot id. */
  id: string;
  bayId: UUID;
  seedIndex: number;
  placementType: 'append' | 'insert-before' | 'split';
  durationDays: number;
  startDate: DateOnlyIso;
  endDate: DateOnlyIso;
};

export type GhostScheduleDerivation = {
  bays: DisplayBaySchedule[];
  ghosts: GhostSlot[];
};

type ProjectableDisplaySlot = Omit<DisplayBaySlot, 'endDate' | 'startDate'>;

type GhostEntryMeta = {
  seedIndex: number;
  placementType: GhostSlot['placementType'];
  /** The resolver's append start, kept to clamp a trailing ghost past a stale queue end. */
  appendStart: DateOnlyIso | null;
};

type WorkingEntry =
  | (ProjectableDisplaySlot & { ghost?: undefined })
  | { durationDays: number; ghost: GhostEntryMeta; id: string; sequence: number };

/**
 * Projects pending Job seeds as client-only ghost Slots against the live Bay queues
 * (ADR-0042: the picked date is a placement hint, resolved with the shared domain
 * resolver — this preview and the server booking resolve identically). Real slots
 * display at their reflowed post-insert positions; a split target renders as two
 * marked halves around the ghost. Bays without a valid seed pass through untouched,
 * same-reference. Seeds resolve sequentially, so a second seed on the same Bay
 * (not constructible in the form, but handled) sees the first ghost in the queue.
 */
export function deriveGhostBaySchedules({
  bays,
  offDays,
  seeds,
  today,
}: {
  bays: BaySchedule[];
  offDays: OffDay[];
  seeds: readonly BayScheduleGhostSeed[];
  today: DateOnlyIso;
}): GhostScheduleDerivation {
  const workingCalendarsByBayId = createWorkingCalendarsByBayId(bays, offDays);
  const ghosts: GhostSlot[] = [];

  const displayBays = bays.map((bay): DisplayBaySchedule => {
    const baySeeds = seeds
      .map((seed, seedIndex) => ({ seed, seedIndex }))
      .filter(({ seed }) => seed.bayId === bay.id && isValidGhostDuration(seed.durationDays));

    if (baySeeds.length === 0) {
      return bay;
    }

    const workingCalendar = workingCalendarsByBayId.get(bay.id) ?? {};
    let entries: WorkingEntry[] = bay.slots.map(({ endDate: _endDate, startDate: _startDate, ...slot }) => ({
      ...slot,
    }));

    for (const { seed, seedIndex } of baySeeds) {
      entries = spliceGhostEntry({
        entries,
        scheduleOrigin: bay.scheduleOrigin,
        seed,
        seedIndex,
        today,
        workingCalendar,
      });
    }

    const projection = projectJobSlots({
      scheduleOrigin: bay.scheduleOrigin,
      slots: entries,
      workingCalendar,
    });
    const displaySlots: DisplayBaySlot[] = [];

    for (const [index, projected] of projection.slots.entries()) {
      if (!projected.ghost) {
        const { ghost: _ghost, ...slot } = projected;
        displaySlots.push(slot as DisplayBaySlot);
        continue;
      }

      // A trailing append ghost clamps forward when the queue ended in the past:
      // the server fills that gap with idle, so the work slot never starts stale.
      const isTrailing = index === projection.slots.length - 1;
      const clampedStart =
        isTrailing && projected.ghost.appendStart && projected.ghost.appendStart > projected.startDate
          ? projected.ghost.appendStart
          : projected.startDate;

      ghosts.push({
        bayId: bay.id,
        durationDays: projected.durationDays,
        endDate:
          clampedStart === projected.startDate
            ? projected.endDate
            : addJobSlotDuration(clampedStart, projected.durationDays, workingCalendar),
        id: projected.id,
        placementType: projected.ghost.placementType,
        seedIndex: projected.ghost.seedIndex,
        startDate: clampedStart,
      });
    }

    return {
      ...bay,
      nextAvailableDate: projection.nextAvailableDate,
      slots: displaySlots,
    };
  });

  return { bays: displayBays, ghosts };
}

/**
 * Lane filter for the embedded Gantt: `undefined` keeps the page behavior
 * (same reference, all Bays); otherwise only the given Bays render, sorted
 * into Department pipeline order. Ids without a matching Bay are ignored.
 */
export function selectVisibleBaySchedules(
  bays: BaySchedule[],
  visibleBayIds: readonly UUID[] | undefined,
): BaySchedule[] {
  if (visibleBayIds === undefined) {
    return bays;
  }

  const visibleIds = new Set<string>(visibleBayIds);

  return sortBaysByDepartmentPipeline(bays.filter((bay) => visibleIds.has(bay.id)));
}

function isValidGhostDuration(durationDays: number): boolean {
  return Number.isInteger(durationDays) && durationDays >= 1;
}

function spliceGhostEntry({
  entries,
  scheduleOrigin,
  seed,
  seedIndex,
  today,
  workingCalendar,
}: {
  entries: WorkingEntry[];
  scheduleOrigin: DateOnlyIso;
  seed: BayScheduleGhostSeed;
  seedIndex: number;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): WorkingEntry[] {
  const pickedDate = DateOnlyIso.safeParse(seed.startDate);
  const placement = pickedDate.success
    ? resolveInsertAtDatePlacement({
        currentDate: today,
        pickedDate: pickedDate.data,
        scheduleOrigin,
        slots: entries,
        workingCalendar,
      })
    : appendPlacement({ entries, scheduleOrigin, today, workingCalendar });
  const ghostEntry: WorkingEntry = {
    durationDays: seed.durationDays,
    ghost: {
      appendStart: placement.type === 'append' ? placement.startDate : null,
      placementType: placement.type,
      seedIndex,
    },
    id: `ghost:${seed.bayId}:${seedIndex}`,
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
    } else if (placement.type === 'insert-before' || target.ghost) {
      // Splitting another ghost has no real slot to halve; degrade to insert-before.
      next.splice(targetIndex, 0, ghostEntry);
    } else {
      // Display-only synthetic ids; previewSplit gates them out of every mutation path,
      // so the UUID brand is never load-bearing for split halves.
      next.splice(
        targetIndex,
        1,
        {
          ...target,
          durationDays: placement.beforeDays,
          id: `${target.id}:before` as ProjectedJobSlot['id'],
          previewSplit: { half: 'before', sourceSlotId: target.id },
        },
        ghostEntry,
        {
          ...target,
          durationDays: placement.afterDays,
          id: `${target.id}:after` as ProjectedJobSlot['id'],
          previewSplit: { half: 'after', sourceSlotId: target.id },
        },
      );
    }
  }

  // Renumbering keeps projectJobSlots' sort deterministic (it tiebreaks equal
  // sequences by id, which would shuffle split halves around the ghost).
  return next.map((entry, index) => ({ ...entry, sequence: index + 1 }));
}

/** A seed with no picked date appends; same formula as the domain resolver's append clamp. */
function appendPlacement({
  entries,
  scheduleOrigin,
  today,
  workingCalendar,
}: {
  entries: WorkingEntry[];
  scheduleOrigin: DateOnlyIso;
  today: DateOnlyIso;
  workingCalendar: WorkingCalendar;
}): { type: 'append'; startDate: DateOnlyIso } {
  const projection = projectJobSlots({ scheduleOrigin, slots: entries, workingCalendar });

  return {
    startDate: firstWorkingDayOnOrAfter(maxDateOnly(projection.nextAvailableDate, today), workingCalendar),
    type: 'append',
  };
}
