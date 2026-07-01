import { type DatabaseTransaction, type Db, jobBays } from '@pkg/db';
import { type BayPlacement, getPlantDateNow, type PreviewBaySlot, previewBaySchedule } from '@pkg/domain';
import {
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
  resolveScheduleWindowFrom,
  toBaySchedules,
  windowBayScheduleSlots,
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
  const baseBays = toBaySchedules(rows, offDays);

  for (const bay of baseBays) {
    const indexedSeeds = seedsByBayId.get(bay.id);

    if (!indexedSeeds || indexedSeeds.length === 0) {
      continue;
    }

    const result = previewBaySchedule(bay, offDays, {
      kind: 'insertSeeds',
      seeds: indexedSeeds.map(({ seed }) => ({ durationDays: seed.durationDays, startDate: seed.startDate ?? '' })),
      today,
    });

    for (const [baySeedIndex, placement] of result.placements.entries()) {
      const seedIndex = indexedSeeds[baySeedIndex]?.seedIndex;

      if (seedIndex !== undefined) {
        placementsBySeedIndex.set(
          seedIndex,
          toSchedulePreviewPlacement(placement, {
            bayId: bay.id,
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
        slots: result.slots.map(toSchedulePreviewSlot),
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

  const windowedBays = windowBayScheduleSlots(
    baseBays.map((bay) => previewBaysById.get(bay.id) ?? bay),
    {
      from: resolveScheduleWindowFrom(input, today),
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

type PreviewPlacementOptions = { bayId: UUID; toPublicSeedIndex: (localSeedIndex: number) => number };

function toSchedulePreviewPlacement(
  placement: BayPlacement,
  options: PreviewPlacementOptions,
): JobSchedulePreviewPlacement {
  if (placement.type === 'append') {
    return { idleGapDays: placement.idleGapDays, startDate: placement.startDate, type: placement.type };
  }

  // The domain resolved whether this seed lands on a real Slot or another seed's ghost, so the target
  // is a discriminant rather than a runtime shape to re-sniff.
  const target =
    placement.targetKind === 'ghost'
      ? { targetGhost: toSchedulePreviewGhostTarget(placement.seedIndex, options) }
      : { targetSlot: toSchedulePreviewSlot(placement.slot) };

  return placement.type === 'insert-before'
    ? { startDate: placement.startDate, type: placement.type, ...target }
    : {
        afterDays: placement.afterDays,
        beforeDays: placement.beforeDays,
        startDate: placement.startDate,
        type: placement.type,
        ...target,
      };
}

function toSchedulePreviewGhostTarget(
  localSeedIndex: number,
  options: PreviewPlacementOptions,
): JobSchedulePreviewGhostTarget {
  const seedIndex = options.toPublicSeedIndex(localSeedIndex);

  return { id: `ghost:${options.bayId}:${seedIndex}`, seedIndex };
}

function toSchedulePreviewSlot(slot: PreviewBaySlot): JobSchedulePreviewSlot {
  const { splitOf, ...rest } = slot;

  return JobSchedulePreviewSlot.parse({
    ...rest,
    id: splitOf ? `${splitOf.sourceSlotId}:${splitOf.half}` : rest.id,
    ...(splitOf ? { previewSplit: { half: splitOf.half, sourceSlotId: splitOf.sourceSlotId } } : {}),
  });
}
