import {
  type DatabaseTransaction,
  type Db,
  jobBayCalendarExceptions,
  jobBayOperatorAssignments,
  jobBays,
  jobSlots,
  type jobs,
} from '@pkg/db';
import { addDateOnlyDays, bayWorkingCalendars, projectJobSlots, type WorkingCalendar } from '@pkg/domain';
import {
  Bay,
  type BayListInput,
  BaySchedule,
  type DateOnlyIso,
  type JobSchedulePreviewInput,
  type OffDay,
  ProjectedJobSlot,
  UUID,
} from '@pkg/schema';
import { asc, inArray, isNull, type SQL } from 'drizzle-orm';
import { getCurrentBayOperator, type OpenOperatorAssignmentsRow } from './job-bay-service.js';

const SCHEDULE_HISTORY_WINDOW_DAYS = 365;

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

export function mapBaySchedule(row: BayScheduleRow, workingCalendar: WorkingCalendar) {
  const bay = Bay.parse({ ...row, currentOperator: getCurrentBayOperator(row) });
  const projection = projectJobSlots({
    scheduleOrigin: bay.scheduleOrigin,
    slots: row.slots,
    workingCalendar,
  });

  return BaySchedule.parse({
    ...bay,
    calendarExceptions: row.calendarExceptions,
    nextAvailableDate: projection.nextAvailableDate,
    slots: projection.slots.map((slot) => {
      if (slot.kind === 'idle') {
        return ProjectedJobSlot.parse(slot);
      }

      if (!slot.job) {
        throw new Error('Work Job slot was missing its Job relation');
      }

      return ProjectedJobSlot.parse({
        ...slot,
        jobCode: slot.job.code,
        jobId: slot.job.id,
      });
    }),
  });
}

export function toBaySchedules(rows: BayScheduleRow[], offDays: readonly OffDay[]): BaySchedule[] {
  const workingCalendars = bayWorkingCalendars(rows, offDays);

  return rows.map((row) => mapBaySchedule(row, workingCalendars.get(row.id) ?? {}));
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

type WindowableScheduleSlot =
  | { endDate: DateOnlyIso; jobId: UUID; kind: 'work' }
  | { endDate: DateOnlyIso; jobId: null; kind: 'idle' };

export function resolveScheduleWindowFrom(
  input: BayListInput | JobSchedulePreviewInput | undefined,
  today: DateOnlyIso,
): DateOnlyIso {
  const earliestFrom = addDateOnlyDays(today, -SCHEDULE_HISTORY_WINDOW_DAYS);
  const requestedFrom = input?.from ?? today;

  return requestedFrom < earliestFrom ? earliestFrom : requestedFrom;
}

export function windowBayScheduleSlots<TBay extends { slots: readonly WindowableScheduleSlot[] }>(
  bays: readonly TBay[],
  {
    from,
    today,
  }: {
    from: DateOnlyIso;
    today: DateOnlyIso;
  },
): TBay[] {
  const unfinishedJobIds = getUnfinishedScheduleJobIds(bays, today);

  return bays.map(
    (bay) =>
      ({
        ...bay,
        slots: bay.slots.filter((slot) => isScheduleSlotInWindow(slot, { from, today, unfinishedJobIds })),
      }) as TBay,
  );
}

function getUnfinishedScheduleJobIds(
  bays: readonly { slots: readonly WindowableScheduleSlot[] }[],
  today: DateOnlyIso,
): Set<UUID> {
  const jobIds = new Set<UUID>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work' && slot.endDate > today) {
        jobIds.add(slot.jobId);
      }
    }
  }

  return jobIds;
}

function isScheduleSlotInWindow(
  slot: WindowableScheduleSlot,
  {
    from,
    today,
    unfinishedJobIds,
  }: {
    from: DateOnlyIso;
    today: DateOnlyIso;
    unfinishedJobIds: ReadonlySet<UUID>;
  },
): boolean {
  if (slot.kind === 'work' && unfinishedJobIds.has(slot.jobId)) {
    return true;
  }

  if (from < today) {
    return slot.endDate >= from;
  }

  // Slot spans are half-open; `endDate === today` has already left the default Active Board.
  return slot.endDate > today;
}

export function getScheduleJobIds(bays: readonly { slots: readonly WindowableScheduleSlot[] }[]): UUID[] {
  const jobIds = new Set<UUID>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind === 'work') {
        jobIds.add(slot.jobId);
      }
    }
  }

  return [...jobIds];
}
