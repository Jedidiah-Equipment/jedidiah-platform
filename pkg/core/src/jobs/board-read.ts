import {
  type DatabaseTransaction,
  type Db,
  jobBayCalendarExceptions,
  jobBayOperatorAssignments,
  jobBays,
  jobSlots,
  type jobs,
} from '@pkg/db';
import {
  type BoardGhost,
  type BoardPlacement,
  type BoardSeed,
  isJobCancelled,
  type ProjectableBoardSlot,
  projectBoard,
  type WorkingCalendar,
} from '@pkg/domain';
import { Bay, type DateOnlyIso, JobCode, JobSlot, type OffDay, ProjectedBayQueue, UUID } from '@pkg/schema';
import { asc, inArray, isNull, type SQL } from 'drizzle-orm';
import { getCurrentBayOperator, type OpenOperatorAssignmentsRow } from './job-bay-service.js';

type BayCalendarExceptionRow = Pick<
  typeof jobBayCalendarExceptions.$inferSelect,
  'bayId' | 'date' | 'direction' | 'label'
>;

export type BoardBayRow = typeof jobBays.$inferSelect &
  OpenOperatorAssignmentsRow & {
    calendarExceptions: BayCalendarExceptionRow[];
    slots: (typeof jobSlots.$inferSelect & {
      job: Pick<typeof jobs.$inferSelect, 'cancelledAt' | 'code' | 'id'> | null;
    })[];
  };

// Any `job:read` user sees the full cross-department Board, so bay reads are not department-scoped.
export function findBoardBayRows(db: Db | DatabaseTransaction, where?: SQL) {
  return db.query.jobBays.findMany({
    where,
    orderBy: [asc(jobBays.department), asc(jobBays.name), asc(jobBays.id)],
    with: {
      operatorAssignments: {
        columns: {},
        where: isNull(jobBayOperatorAssignments.unassignedAt),
        with: {
          operator: {
            columns: { email: true, id: true, image: true, name: true },
          },
        },
      },
      calendarExceptions: {
        columns: {
          bayId: true,
          date: true,
          direction: true,
          label: true,
        },
        orderBy: [asc(jobBayCalendarExceptions.date)],
      },
      slots: {
        orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
        with: {
          job: {
            columns: {
              cancelledAt: true,
              code: true,
              id: true,
            },
          },
        },
      },
    },
  });
}

export type ProjectedBoardQueues = {
  ghosts: BoardGhost[];
  placements: BoardPlacement[];
  queues: ProjectedBayQueue[];
  workingCalendarsByBayId: Map<string, WorkingCalendar>;
};

/**
 * The one assembly seam from Board rows to wire shapes: parse each Bay once, run the domain Board
 * builder (with any pending insert-seeds), and parse each Bay Queue at the boundary. The live board
 * read and the preview both come through here, so they can never assemble differently.
 */
export function toProjectedBoard(
  rows: readonly BoardBayRow[],
  {
    offDays,
    seeds = [],
    today,
  }: {
    offDays: readonly OffDay[];
    seeds?: readonly BoardSeed[];
    today: DateOnlyIso;
  },
): ProjectedBoardQueues {
  const bayRows = rows.map((row) => ({
    bay: Bay.parse({ ...row, currentOperator: getCurrentBayOperator(row) }),
    row,
  }));
  const board = projectBoard({
    bays: bayRows.map(({ bay, row }) => ({
      calendarExceptions: row.calendarExceptions,
      id: bay.id,
      scheduleOrigin: bay.scheduleOrigin,
      slots: row.slots.map(toBoardSlotFact),
    })),
    offDays,
    seeds,
    today,
  });
  const projectedBaysById = new Map(board.bays.map((projectedBay) => [projectedBay.bayId, projectedBay] as const));

  return {
    ghosts: board.ghosts,
    placements: board.placements,
    queues: bayRows.map(({ bay, row }) => {
      const projectedBay = projectedBaysById.get(bay.id);

      if (!projectedBay) {
        throw new Error(`Projected Board was missing Bay ${bay.id}`);
      }

      return ProjectedBayQueue.parse({
        ...bay,
        calendarExceptions: row.calendarExceptions,
        nextAvailableDate: projectedBay.nextAvailableDate,
        slots: projectedBay.slots,
      });
    }),
    workingCalendarsByBayId: new Map(
      board.bays.map((projectedBay) => [projectedBay.bayId, projectedBay.workingCalendar] as const),
    ),
  };
}

function toBoardSlotFact(slot: BoardBayRow['slots'][number]): ProjectableBoardSlot {
  const { job, ...slotFact } = slot;
  const parsed = JobSlot.parse(slotFact);

  if (parsed.kind === 'idle') {
    return parsed;
  }

  if (!job) {
    throw new Error('Work Job slot was missing its Job relation');
  }

  return { ...parsed, jobCode: JobCode.parse(job.code) };
}

export async function findBoardBayRowsForJobs({
  db,
  jobIds,
}: {
  db: Db | DatabaseTransaction;
  jobIds: readonly UUID[];
}): Promise<BoardBayRow[]> {
  if (jobIds.length === 0) {
    return [];
  }

  const bayIds = db
    .selectDistinct({ bayId: jobSlots.bayId })
    .from(jobSlots)
    .where(inArray(jobSlots.jobId, [...jobIds]));

  return findBoardBayRows(db, inArray(jobBays.id, bayIds));
}

export function getBoardBayRowJobIds(rows: readonly BoardBayRow[]): UUID[] {
  const jobIds = new Set<UUID>();

  for (const row of rows) {
    for (const slot of row.slots) {
      if (slot.kind === 'work' && slot.jobId) {
        jobIds.add(UUID.parse(slot.jobId));
      }
    }
  }

  return [...jobIds];
}

export function mergeBoardBayRows(primaryRows: readonly BoardBayRow[], extraRows: readonly BoardBayRow[]) {
  const primaryIds = new Set(primaryRows.map((row) => row.id));

  return [...primaryRows, ...extraRows.filter((row) => !primaryIds.has(row.id))];
}

/** Planning treats retained cancelled work as history, while the truthful Board keeps those rows intact. */
export function withoutCancelledJobSlots(rows: readonly BoardBayRow[]): BoardBayRow[] {
  return rows.map((row) => ({
    ...row,
    slots: row.slots.filter((slot) => !isJobCancelled(slot.job)),
  }));
}
