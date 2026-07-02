import { type DatabaseTransaction, type Db, jobBays } from '@pkg/db';
import { getPlantDateNow, projectBoard, resolveBoardWindowFrom, windowActiveBoard } from '@pkg/domain';
import { type BoardPreviewInput, BoardPreviewResult, ProjectedBayQueue, type UUID } from '@pkg/schema';
import { inArray } from 'drizzle-orm';
import {
  findBoardBayRows,
  findBoardBayRowsForJobs,
  getBoardBayRowJobIds,
  mapProjectedBayQueue,
  mergeBoardBayRows,
  toBoardBayFacts,
} from './board-read.js';
import { JobBayNotFoundError } from './job-errors.js';
import { listWorkingCalendarOffDays } from './working-calendar-service.js';

export async function previewBoard({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input: BoardPreviewInput;
}): Promise<BoardPreviewResult> {
  if (input.seeds.length === 0) {
    return BoardPreviewResult.parse({ bays: [], ghosts: [], placements: [] });
  }

  const seededBayIds = [...new Set(input.seeds.map((seed) => seed.bayId))];
  const [offDays, seededRows] = await Promise.all([
    listWorkingCalendarOffDays(db),
    findBoardBayRows(db, inArray(jobBays.id, seededBayIds)),
  ]);
  const rowIds = new Set(seededRows.map((row) => row.id));
  const missingBayId = seededBayIds.find((bayId) => !rowIds.has(bayId));

  if (missingBayId) {
    throw new JobBayNotFoundError(missingBayId);
  }

  // Seeded Bays still need the cross-Bay closure for Jobs on those Bays so the Board can resolve
  // `jobUnfinished` before the Active Board window trims any sibling Slots.
  const crossBayRows = await findBoardBayRowsForJobs({
    db,
    jobIds: getBoardBayRowJobIds(seededRows),
  });
  const rows = mergeBoardBayRows(seededRows, crossBayRows);
  const today = getPlantDateNow();
  const board = projectBoard({ bays: rows.map(toBoardBayFacts), offDays, seeds: input.seeds, today });
  const projectedBaysById = new Map(board.bays.map((bay) => [bay.bayId, bay] as const));
  const seededBayIdSet = new Set<UUID>(seededBayIds);
  const baseBays = rows.map((row) => {
    const projectedBay = projectedBaysById.get(row.id);

    if (!projectedBay) {
      throw new Error(`Projected Board was missing Bay ${row.id}`);
    }

    return mapProjectedBayQueue(row, projectedBay);
  });
  const windowedBays = windowActiveBoard(baseBays, {
    from: resolveBoardWindowFrom(input, today),
    today,
  });
  const previewBays = windowedBays
    .filter((bay) => seededBayIdSet.has(bay.id))
    .map((bay) => ProjectedBayQueue.parse(bay));

  return BoardPreviewResult.parse({ bays: previewBays, ghosts: board.ghosts, placements: board.placements });
}
