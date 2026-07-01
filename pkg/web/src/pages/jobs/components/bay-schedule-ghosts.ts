import type {
  BaySchedule,
  JobSchedulePreviewInput,
  JobSchedulePreviewResult,
  JobSchedulePreviewSlot,
  UUID,
} from '@pkg/schema';
import { DateOnlyIso } from '@pkg/schema';

import { sortBaysByDepartmentPipeline } from '@/components/bays/sort-bays.js';

export type BayScheduleGhostSeed = {
  bayId: UUID;
  /** Rows with a non-positive or non-integer (NaN-until-typed) duration produce no ghost. */
  durationDays: number;
  /** DatePicker raw value; `''` or unparsable means plain append. */
  startDate: string;
};

/**
 * A Bay schedule slot as displayed in the ghost preview: real slots flow through
 * unchanged, while a slot split by a ghost renders as two halves carrying a marker
 * and a suffixed synthetic id (`:before` / `:after`) that must never reach a mutation.
 */
export type DisplayBaySlot = JobSchedulePreviewSlot;
export type DisplayBaySchedule = Omit<BaySchedule, 'slots'> & { slots: DisplayBaySlot[] };
export type GhostSlot = JobSchedulePreviewResult['ghosts'][number];

export type GhostScheduleDerivation = {
  bays: DisplayBaySchedule[];
  ghosts: GhostSlot[];
};

export type SchedulePreviewRequest = {
  input: JobSchedulePreviewInput;
  seedIndexByPreviewIndex: number[];
};

export function createSchedulePreviewRequest(
  seeds: readonly BayScheduleGhostSeed[],
  options: { includeSeed?: (seed: BayScheduleGhostSeed) => boolean } = {},
): SchedulePreviewRequest {
  const previewSeeds: JobSchedulePreviewInput['seeds'] = [];
  const seedIndexByPreviewIndex: number[] = [];

  for (const [seedIndex, seed] of seeds.entries()) {
    if (options.includeSeed && !options.includeSeed(seed)) {
      continue;
    }

    if (!Number.isInteger(seed.durationDays) || seed.durationDays < 1) {
      continue;
    }

    const parsedStartDate = DateOnlyIso.safeParse(seed.startDate);
    previewSeeds.push({
      bayId: seed.bayId,
      durationDays: seed.durationDays,
      ...(parsedStartDate.success ? { startDate: parsedStartDate.data } : {}),
    });
    seedIndexByPreviewIndex.push(seedIndex);
  }

  return {
    input: { seeds: previewSeeds },
    seedIndexByPreviewIndex,
  };
}

/**
 * Merges the server preview into the visible lanes. Projection, split placement, and ghost ranges
 * are resolved by `jobs.previewSchedule`; this layer only preserves same-reference Bays that were
 * not affected by the request.
 */
export function deriveGhostBaySchedules({
  bays,
  preview,
  seedIndexByPreviewIndex,
}: {
  bays: BaySchedule[];
  preview: JobSchedulePreviewResult;
  seedIndexByPreviewIndex: readonly number[];
}): GhostScheduleDerivation {
  const previewBaysById = new Map(preview.bays.map((bay) => [bay.id, bay]));
  const displayBays = bays.map((bay): DisplayBaySchedule => previewBaysById.get(bay.id) ?? bay);
  const ghosts = preview.ghosts.map((ghost) => {
    const seedIndex = seedIndexByPreviewIndex[ghost.seedIndex] ?? ghost.seedIndex;

    return {
      ...ghost,
      id: `ghost:${ghost.bayId}:${seedIndex}`,
      seedIndex,
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
