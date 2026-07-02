import {
  type DatabaseTransaction,
  type Db,
  jobBayCalendarExceptions,
  jobBayOperatorAssignments,
  jobBays,
  jobSlots,
  type jobs,
} from '@pkg/db';
import { type BoardBayFacts, type ProjectedBoardBay, projectBoard } from '@pkg/domain';
import {
  Bay,
  BaySchedule,
  DateIso,
  type DateOnlyIso,
  JobCode,
  type OffDay,
  ProjectedJobSlot,
  SlotDurationDays,
  SlotSequence,
  UUID,
} from '@pkg/schema';
import { asc, inArray, isNull, type SQL } from 'drizzle-orm';
import { getCurrentBayOperator, type OpenOperatorAssignmentsRow } from './job-bay-service.js';

type BayCalendarExceptionRow = Pick<
  typeof jobBayCalendarExceptions.$inferSelect,
  'bayId' | 'date' | 'direction' | 'label'
>;

export type BayScheduleRow = typeof jobBays.$inferSelect &
  OpenOperatorAssignmentsRow & {
    calendarExceptions: BayCalendarExceptionRow[];
    slots: (typeof jobSlots.$inferSelect & {
      job: Pick<typeof jobs.$inferSelect, 'code' | 'id'> | null;
    })[];
  };

// Any `job:read` user sees the full cross-department schedule, so bay reads are not department-scoped.
export function findBayScheduleRows(db: Db | DatabaseTransaction, where?: SQL) {
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
              code: true,
              id: true,
            },
          },
        },
      },
    },
  });
}

export function mapBaySchedule(row: BayScheduleRow, projectedBay: ProjectedBoardBay) {
  const bay = Bay.parse({ ...row, currentOperator: getCurrentBayOperator(row) });

  return BaySchedule.parse({
    ...bay,
    calendarExceptions: row.calendarExceptions,
    nextAvailableDate: projectedBay.nextAvailableDate,
    slots: projectedBay.slots.map((slot) => ProjectedJobSlot.parse(slot)),
  });
}

export function toBaySchedules(
  rows: readonly BayScheduleRow[],
  offDays: readonly OffDay[],
  today: DateOnlyIso,
): BaySchedule[] {
  const board = projectBoard({ bays: rows.map(toBoardBayFacts), offDays, today });
  const projectedBaysById = new Map(board.bays.map((bay) => [bay.bayId, bay] as const));

  return rows.map((row) => {
    const projectedBay = projectedBaysById.get(row.id);

    if (!projectedBay) {
      throw new Error(`Projected Board was missing Bay ${row.id}`);
    }

    return mapBaySchedule(row, projectedBay);
  });
}

function toBoardBayFacts(row: BayScheduleRow): BoardBayFacts {
  const bay = Bay.parse({ ...row, currentOperator: getCurrentBayOperator(row) });

  return {
    calendarExceptions: row.calendarExceptions,
    id: bay.id,
    scheduleOrigin: bay.scheduleOrigin,
    slots: row.slots.map(toBoardSlotFact),
  };
}

function toBoardSlotFact(slot: BayScheduleRow['slots'][number]): BoardBayFacts['slots'][number] {
  const { job: _job, ...slotFact } = slot;
  const base = {
    bayId: UUID.parse(slotFact.bayId),
    createdAt: DateIso.parse(slotFact.createdAt),
    durationDays: SlotDurationDays.parse(slotFact.durationDays),
    id: UUID.parse(slotFact.id),
    sequence: SlotSequence.parse(slotFact.sequence),
    updatedAt: DateIso.parse(slotFact.updatedAt),
  };

  if (slot.kind === 'idle') {
    return {
      ...base,
      jobId: null,
      kind: 'idle',
      label: slot.label,
    };
  }

  if (!slot.job) {
    throw new Error('Work Job slot was missing its Job relation');
  }

  return {
    ...base,
    jobCode: JobCode.parse(slot.job.code),
    jobId: UUID.parse(slot.job.id),
    kind: 'work',
    label: null,
  };
}

export async function findBayScheduleRowsForJobs({
  db,
  jobIds,
}: {
  db: Db | DatabaseTransaction;
  jobIds: readonly UUID[];
}): Promise<BayScheduleRow[]> {
  if (jobIds.length === 0) {
    return [];
  }

  const bayIds = db
    .selectDistinct({ bayId: jobSlots.bayId })
    .from(jobSlots)
    .where(inArray(jobSlots.jobId, [...jobIds]));

  return findBayScheduleRows(db, inArray(jobBays.id, bayIds));
}

export function getBayScheduleRowJobIds(rows: readonly BayScheduleRow[]): UUID[] {
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

export function mergeBayScheduleRows(primaryRows: readonly BayScheduleRow[], extraRows: readonly BayScheduleRow[]) {
  const primaryIds = new Set(primaryRows.map((row) => row.id));

  return [...primaryRows, ...extraRows.filter((row) => !primaryIds.has(row.id))];
}
