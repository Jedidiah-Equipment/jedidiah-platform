import { type DatabaseTransaction, type Db, jobBays } from '@pkg/db';
import {
  type BayPlacement,
  getPlantDateNow,
  type PreviewBaySlot,
  previewBayScheduleSeedInserts,
  resolveBoardWindowFrom,
  slotState,
  windowActiveBoard,
} from '@pkg/domain';
import {
  type DateOnlyIso,
  JobSchedulePreviewBay,
  type JobSchedulePreviewGhost,
  type JobSchedulePreviewGhostTarget,
  type JobSchedulePreviewInput,
  type JobSchedulePreviewPlacement,
  JobSchedulePreviewResult,
  JobSchedulePreviewSlot,
  type UUID,
} from '@pkg/schema';
import { inArray } from 'drizzle-orm';
import {
  findBayScheduleRows,
  findBayScheduleRowsForJobs,
  getBayScheduleRowJobIds,
  mergeBayScheduleRows,
  toBaySchedules,
} from './bay-schedule-read.js';
import { JobBayNotFoundError } from './job-errors.js';
import { listWorkingCalendarOffDays } from './working-calendar-service.js';

export async function previewJobSchedule({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input: JobSchedulePreviewInput;
}): Promise<JobSchedulePreviewResult> {
  if (input.seeds.length === 0) {
    return JobSchedulePreviewResult.parse({ bays: [], ghosts: [], placements: [] });
  }

  const bayIds = [...new Set(input.seeds.map((seed) => seed.bayId))];
  const [offDays, seededRows] = await Promise.all([
    listWorkingCalendarOffDays(db),
    findBayScheduleRows(db, inArray(jobBays.id, bayIds)),
  ]);
  const rowIds = new Set(seededRows.map((row) => row.id));
  const missingBayId = bayIds.find((bayId) => !rowIds.has(bayId));

  if (missingBayId) {
    throw new JobBayNotFoundError(missingBayId);
  }

  // Windowing a seeded Bay still needs cross-Bay Slots for Jobs on that Bay to classify partly-done routes.
  const crossBayRows = await findBayScheduleRowsForJobs({
    db,
    jobIds: getBayScheduleRowJobIds(seededRows),
  });
  const rows = mergeBayScheduleRows(seededRows, crossBayRows);

  const today = getPlantDateNow();
  const seedsByBayId = groupPreviewSeedsByBayId(input.seeds);
  const placementsBySeedIndex = new Map<number, JobSchedulePreviewPlacement>();
  const ghosts: JobSchedulePreviewGhost[] = [];
  const previewBaysById = new Map<UUID, JobSchedulePreviewBay>();
  const baseBays = toBaySchedules(rows, offDays, today);
  const jobUnfinishedByJobId = new Map<UUID, boolean>();

  for (const bay of baseBays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work') {
        jobUnfinishedByJobId.set(slot.jobId, slot.jobUnfinished);
      }
    }
  }

  for (const bay of baseBays) {
    const indexedSeeds = seedsByBayId.get(bay.id);

    if (!indexedSeeds || indexedSeeds.length === 0) {
      continue;
    }

    const result = previewBayScheduleSeedInserts(bay, offDays, {
      seeds: indexedSeeds.map(({ seed }) => ({ durationDays: seed.durationDays, startDate: seed.startDate ?? '' })),
      today,
    });

    for (const [baySeedIndex, placement] of result.placements.entries()) {
      const seedIndex = indexedSeeds[baySeedIndex]?.seedIndex;

      if (seedIndex !== undefined) {
        const slotOptions = { jobUnfinishedByJobId, today };

        placementsBySeedIndex.set(
          seedIndex,
          toSchedulePreviewPlacement(placement, {
            bayId: bay.id,
            slotOptions,
            toPublicSeedIndex: (localSeedIndex) => indexedSeeds[localSeedIndex]?.seedIndex ?? localSeedIndex,
          }),
        );
      }
    }

    for (const ghost of result.ghosts) {
      const seedIndex = indexedSeeds[ghost.seedIndex]?.seedIndex ?? ghost.seedIndex;

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

    previewBaysById.set(
      bay.id,
      JobSchedulePreviewBay.parse({
        ...bay,
        nextAvailableDate: result.nextAvailableDate,
        slots: result.slots.map((slot) => toSchedulePreviewSlot(slot, { jobUnfinishedByJobId, today })),
      }),
    );
  }

  const placements = input.seeds.map((_seed, seedIndex) => {
    const placement = placementsBySeedIndex.get(seedIndex);

    if (!placement) {
      throw new Error('Schedule preview placement was not resolved for every seed');
    }

    return placement;
  });

  const windowedBays = windowActiveBoard(
    baseBays.map((bay) => previewBaysById.get(bay.id) ?? bay),
    {
      from: resolveBoardWindowFrom(input, today),
      today,
    },
  );
  const previewBays = windowedBays
    .filter((bay) => previewBaysById.has(bay.id))
    .map((bay) => JobSchedulePreviewBay.parse(bay));

  return JobSchedulePreviewResult.parse({ bays: previewBays, ghosts, placements });
}

function groupPreviewSeedsByBayId(seeds: JobSchedulePreviewInput['seeds']) {
  const grouped = new Map<UUID, { seed: JobSchedulePreviewInput['seeds'][number]; seedIndex: number }[]>();

  for (const [seedIndex, seed] of seeds.entries()) {
    const existing = grouped.get(seed.bayId) ?? [];
    existing.push({ seed, seedIndex });
    grouped.set(seed.bayId, existing);
  }

  return grouped;
}

type PreviewSlotOptions = { jobUnfinishedByJobId: ReadonlyMap<UUID, boolean>; today: DateOnlyIso };
type PreviewPlacementOptions = {
  bayId: UUID;
  slotOptions: PreviewSlotOptions;
  toPublicSeedIndex: (localSeedIndex: number) => number;
};

function toSchedulePreviewPlacement(
  placement: BayPlacement,
  options: PreviewPlacementOptions,
): JobSchedulePreviewPlacement {
  if (placement.type === 'append') {
    return { idleGapDays: placement.idleGapDays, startDate: placement.startDate, type: placement.type };
  }

  // A split always lands on a real Slot (the domain degrades a ghost split to insert-before).
  if (placement.type === 'split') {
    return {
      afterDays: placement.afterDays,
      beforeDays: placement.beforeDays,
      startDate: placement.startDate,
      targetSlot: toSchedulePreviewSlot(placement.slot, options.slotOptions),
      type: placement.type,
    };
  }

  // An insert-before lands on a real Slot or an earlier seed's ghost; the domain already discriminated
  // which, so this reads the tag rather than re-sniffing a runtime shape.
  return placement.targetKind === 'ghost'
    ? {
        startDate: placement.startDate,
        targetGhost: toSchedulePreviewGhostTarget(placement.seedIndex, options),
        type: placement.type,
      }
    : {
        startDate: placement.startDate,
        targetSlot: toSchedulePreviewSlot(placement.slot, options.slotOptions),
        type: placement.type,
      };
}

function toSchedulePreviewGhostTarget(
  localSeedIndex: number,
  options: PreviewPlacementOptions,
): JobSchedulePreviewGhostTarget {
  const seedIndex = options.toPublicSeedIndex(localSeedIndex);

  return { id: `ghost:${options.bayId}:${seedIndex}`, seedIndex };
}

function toSchedulePreviewSlot(slot: PreviewBaySlot, options: PreviewSlotOptions): JobSchedulePreviewSlot {
  const { splitOf, ...rest } = slot;
  const state = slotState(rest, options.today);

  // Temporary for #687: preview still uses the legacy seed-insert projection until it unifies onto projectBoard.
  const jobUnfinished =
    rest.kind === 'work'
      ? (options.jobUnfinishedByJobId.get(rest.jobId) ?? missingPreviewJobUnfinished(rest.jobId))
      : undefined;

  return JobSchedulePreviewSlot.parse({
    ...rest,
    id: splitOf ? `${splitOf.sourceSlotId}:${splitOf.half}` : rest.id,
    state,
    ...(rest.kind === 'work' ? { jobUnfinished } : {}),
    ...(splitOf ? { previewSplit: { half: splitOf.half, sourceSlotId: splitOf.sourceSlotId } } : {}),
  });
}

function missingPreviewJobUnfinished(jobId: UUID): never {
  throw new Error(`Schedule preview could not resolve jobUnfinished for Job ${jobId}`);
}
