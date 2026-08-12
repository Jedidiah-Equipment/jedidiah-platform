import type { BoardPreviewInput, BoardPreviewResult, ProjectedBayQueue, UUID } from '@pkg/schema';
import { DateOnlyIso } from '@pkg/schema';

export type BoardGhostSeed = {
  bayId: UUID;
  /** Rows with a non-positive or non-integer (NaN-until-typed) duration produce no ghost. */
  durationDays: number;
  /** DatePicker raw value; `''` or unparsable means plain append. */
  startDate: string;
};

export type GhostSlot = BoardPreviewResult['ghosts'][number];

export type BoardGhostDerivation = {
  bays: ProjectedBayQueue[];
  ghosts: GhostSlot[];
};

export type BoardPreviewRequest = {
  input: BoardPreviewInput;
};

export function createBoardPreviewRequest(
  seeds: readonly BoardGhostSeed[],
  options: { includeSeed?: (seed: BoardGhostSeed) => boolean } = {},
): BoardPreviewRequest {
  const previewSeeds: BoardPreviewInput['seeds'] = [];

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
export function deriveGhostProjectedBayQueues({
  bays,
  preview,
}: {
  bays: ProjectedBayQueue[];
  preview: BoardPreviewResult;
}): BoardGhostDerivation {
  const previewBaysById = new Map(preview.bays.map((bay) => [bay.id, bay]));
  const displayBays = bays.map((bay) => previewBaysById.get(bay.id) ?? bay);

  return { bays: displayBays, ghosts: preview.ghosts };
}

/**
 * Lane filter for the Gantt's embedded surfaces. Ordering belongs to the shared
 * Gantt layout so sidebar lanes and timeline offsets cannot diverge.
 */
export function selectVisibleProjectedBayQueues(
  bays: ProjectedBayQueue[],
  visibleBayIds: readonly UUID[] | undefined,
): ProjectedBayQueue[] {
  if (visibleBayIds === undefined) {
    return bays;
  }

  const visibleIds = new Set<string>(visibleBayIds);

  return bays.filter((bay) => visibleIds.has(bay.id));
}
