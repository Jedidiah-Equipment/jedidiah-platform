import { type DatabaseTransaction, type Db, jobBays } from '@pkg/db';
import { getPlantDateNow, projectBoard, resolveBoardWindowFrom, windowActiveBoard } from '@pkg/domain';
import { BaySchedule, type JobSchedulePreviewInput, JobSchedulePreviewResult, type UUID } from '@pkg/schema';
import { inArray } from 'drizzle-orm';
import {
  findBayScheduleRows,
  findBayScheduleRowsForJobs,
  getBayScheduleRowJobIds,
  mapBaySchedule,
  mergeBayScheduleRows,
  toBoardBayFacts,
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

  const seededBayIds = [...new Set(input.seeds.map((seed) => seed.bayId))];
  const [offDays, seededRows] = await Promise.all([
    listWorkingCalendarOffDays(db),
    findBayScheduleRows(db, inArray(jobBays.id, seededBayIds)),
  ]);
  const rowIds = new Set(seededRows.map((row) => row.id));
  const missingBayId = seededBayIds.find((bayId) => !rowIds.has(bayId));

  if (missingBayId) {
    throw new JobBayNotFoundError(missingBayId);
  }

  // Seeded Bays still need the cross-Bay closure for Jobs on those Bays so the Board can resolve
  // `jobUnfinished` before the Active Board window trims any sibling Slots.
  const crossBayRows = await findBayScheduleRowsForJobs({
    db,
    jobIds: getBayScheduleRowJobIds(seededRows),
  });
  const rows = mergeBayScheduleRows(seededRows, crossBayRows);
  const today = getPlantDateNow();
  const board = projectBoard({ bays: rows.map(toBoardBayFacts), offDays, seeds: input.seeds, today });
  const projectedBaysById = new Map(board.bays.map((bay) => [bay.bayId, bay] as const));
  const seededBayIdSet = new Set<UUID>(seededBayIds);
  const baseBays = rows.map((row) => {
    const projectedBay = projectedBaysById.get(row.id);

    if (!projectedBay) {
      throw new Error(`Projected Board was missing Bay ${row.id}`);
    }

    return mapBaySchedule(row, projectedBay);
  });
  const windowedBays = windowActiveBoard(baseBays, {
    from: resolveBoardWindowFrom(input, today),
    today,
  });
  const previewBays = windowedBays.filter((bay) => seededBayIdSet.has(bay.id)).map((bay) => BaySchedule.parse(bay));

  return JobSchedulePreviewResult.parse({ bays: previewBays, ghosts: board.ghosts, placements: board.placements });
}
