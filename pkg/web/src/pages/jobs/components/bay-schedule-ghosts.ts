import type { BaySchedule, JobSchedulePreviewInput, JobSchedulePreviewResult, UUID } from '@pkg/schema';
import { DateOnlyIso } from '@pkg/schema';

import { sortBaysByDepartmentPipeline } from '@/components/bays/sort-bays.js';

export type BayScheduleGhostSeed = {
  bayId: UUID;
  /** Rows with a non-positive or non-integer (NaN-until-typed) duration produce no ghost. */
  durationDays: number;
  /** DatePicker raw value; `''` or unparsable means plain append. */
  startDate: string;
};

export type GhostSlot = JobSchedulePreviewResult['ghosts'][number];

export type GhostScheduleDerivation = {
  bays: BaySchedule[];
  ghosts: GhostSlot[];
};

export type SchedulePreviewRequest = {
  input: JobSchedulePreviewInput;
};

export function createSchedulePreviewRequest(
  seeds: readonly BayScheduleGhostSeed[],
  options: { includeSeed?: (seed: BayScheduleGhostSeed) => boolean } = {},
): SchedulePreviewRequest {
  const previewSeeds: JobSchedulePreviewInput['seeds'] = [];

  for (const seed of seeds) {
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
  }

  return {
    input: { seeds: previewSeeds },
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
}: {
  bays: BaySchedule[];
  preview: JobSchedulePreviewResult;
}): GhostScheduleDerivation {
  const previewBaysById = new Map(preview.bays.map((bay) => [bay.id, bay]));
  const displayBays = bays.map((bay) => previewBaysById.get(bay.id) ?? bay);

  return { bays: displayBays, ghosts: preview.ghosts };
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
