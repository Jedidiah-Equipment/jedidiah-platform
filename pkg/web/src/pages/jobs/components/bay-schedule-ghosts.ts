import { type BayPlacementType, previewBaySchedule } from '@pkg/domain';
import type { BaySchedule, DateOnlyIso, OffDay, ProjectedJobSlot, UUID } from '@pkg/schema';

import { sortBaysByDepartmentPipeline } from '@/components/bays/sort-bays.js';

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
  placementType: BayPlacementType;
  durationDays: number;
  startDate: DateOnlyIso;
  endDate: DateOnlyIso;
};

export type GhostScheduleDerivation = {
  bays: DisplayBaySchedule[];
  ghosts: GhostSlot[];
};

/**
 * Projects pending Job seeds as client-only ghost Slots against the live Bay queues, delegating the
 * placement, split, and reprojection to the shared `previewBaySchedule` (so this preview and the
 * server booking resolve identically). This layer only maps the neutral result to display shapes:
 * split halves get a marker and a synthetic id, ghosts get their `ghost:${bayId}:${seedIndex}` key.
 * Bays without a valid seed pass through untouched, same-reference.
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
  const indexedSeeds = seeds.map((seed, index) => ({ index, seed }));
  const ghosts: GhostSlot[] = [];

  const displayBays = bays.map((bay): DisplayBaySchedule => {
    const baySeeds = indexedSeeds.filter(({ seed }) => seed.bayId === bay.id);

    if (baySeeds.length === 0) {
      return bay;
    }

    const result = previewBaySchedule(bay, offDays, {
      kind: 'insertSeeds',
      seeds: baySeeds.map(({ seed }) => ({ durationDays: seed.durationDays, startDate: seed.startDate })),
      today,
    });

    if (!result.changed) {
      return bay;
    }

    for (const ghost of result.ghosts) {
      // The domain seed index is the position in the per-Bay seeds; map it back to the form's index.
      const seedIndex = baySeeds[ghost.seedIndex]?.index ?? ghost.seedIndex;

      ghosts.push({
        bayId: bay.id,
        durationDays: ghost.durationDays,
        endDate: ghost.endDate,
        id: `ghost:${bay.id}:${seedIndex}`,
        placementType: ghost.placementType,
        seedIndex,
        startDate: ghost.startDate,
      });
    }

    return {
      ...bay,
      nextAvailableDate: result.nextAvailableDate,
      slots: result.slots.map((slot): DisplayBaySlot => {
        if (!slot.splitOf) {
          return slot;
        }

        const { splitOf, ...rest } = slot;

        return {
          ...rest,
          id: `${splitOf.sourceSlotId}:${splitOf.half}` as ProjectedJobSlot['id'],
          previewSplit: { half: splitOf.half, sourceSlotId: splitOf.sourceSlotId },
        };
      }),
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
