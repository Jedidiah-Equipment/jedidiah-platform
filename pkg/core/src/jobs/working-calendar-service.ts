import { type DatabaseTransaction, type Db, jobBayCalendarExceptions, jobBays, workingCalendarOffDays } from '@pkg/db';
import { getPlantDateNow, type WorkingCalendar } from '@pkg/domain';
import {
  type AddBayCalendarExceptionInput,
  AddBayCalendarExceptionResult,
  BayCalendarException,
  type BayCalendarExceptionDirection,
  OffDay,
  type ProjectedWorkJobSlot,
  type RemoveBayCalendarExceptionInput,
  RemoveBayCalendarExceptionResult,
  type ToggleOffDayInput,
  ToggleOffDayResult,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';

import { findBoardBayRows, toProjectedBoard } from './board-read.js';
import { JobBayNotFoundError, JobCancelledError } from './job-errors.js';

export async function toggleOffDay({ db, input }: { db: Db; input: ToggleOffDayInput }): Promise<ToggleOffDayResult> {
  return db.transaction(async (tx) => {
    // An org Off-Day reprojects every queue, so lock Bays in one order before snapshotting retained history.
    await tx.select({ id: jobBays.id }).from(jobBays).orderBy(asc(jobBays.id)).for('update');
    const cancelledSlotProjections = await getCancelledSlotProjections(tx);

    if (!input.isOffDay) {
      await tx.delete(workingCalendarOffDays).where(eq(workingCalendarOffDays.date, input.date));
      await assertCancelledSlotProjectionsUnchanged(tx, cancelledSlotProjections);

      return ToggleOffDayResult.parse({ offDay: null });
    }

    const [row] = await tx
      .insert(workingCalendarOffDays)
      .values({
        date: input.date,
        label: input.label,
      })
      .onConflictDoUpdate({
        target: workingCalendarOffDays.date,
        set: {
          label: input.label,
          updatedAt: new Date(),
        },
      })
      .returning({
        date: workingCalendarOffDays.date,
        label: workingCalendarOffDays.label,
      });

    if (!row) {
      throw new Error('Off-Day upsert did not return a row');
    }

    await assertCancelledSlotProjectionsUnchanged(tx, cancelledSlotProjections);

    return ToggleOffDayResult.parse({ offDay: row });
  });
}

export async function addBayCalendarException({
  db,
  input,
}: {
  db: Db;
  input: AddBayCalendarExceptionInput;
}): Promise<AddBayCalendarExceptionResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    const cancelledSlotProjections = await getCancelledSlotProjections(tx, bay.id);

    const [row] = await tx
      .insert(jobBayCalendarExceptions)
      .values({
        bayId: bay.id,
        date: input.date,
        direction: input.direction,
        label: input.label,
      })
      .onConflictDoUpdate({
        target: [jobBayCalendarExceptions.bayId, jobBayCalendarExceptions.date],
        set: {
          direction: input.direction,
          label: input.label,
          updatedAt: new Date(),
        },
      })
      .returning({
        bayId: jobBayCalendarExceptions.bayId,
        date: jobBayCalendarExceptions.date,
        direction: jobBayCalendarExceptions.direction,
        label: jobBayCalendarExceptions.label,
      });

    if (!row) {
      throw new Error('Bay calendar exception upsert did not return a row');
    }

    await assertCancelledSlotProjectionsUnchanged(tx, cancelledSlotProjections, bay.id);

    return AddBayCalendarExceptionResult.parse({ exception: row });
  });
}

export async function removeBayCalendarException({
  db,
  input,
}: {
  db: Db;
  input: RemoveBayCalendarExceptionInput;
}): Promise<RemoveBayCalendarExceptionResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    const cancelledSlotProjections = await getCancelledSlotProjections(tx, bay.id);

    const [row] = await tx
      .delete(jobBayCalendarExceptions)
      .where(and(eq(jobBayCalendarExceptions.bayId, bay.id), eq(jobBayCalendarExceptions.date, input.date)))
      .returning({
        bayId: jobBayCalendarExceptions.bayId,
        date: jobBayCalendarExceptions.date,
        direction: jobBayCalendarExceptions.direction,
        label: jobBayCalendarExceptions.label,
      });

    await assertCancelledSlotProjectionsUnchanged(tx, cancelledSlotProjections, bay.id);

    return RemoveBayCalendarExceptionResult.parse({ exception: row ?? null });
  });
}

type CancelledSlotProjection = Pick<ProjectedWorkJobSlot, 'endDate' | 'firstWorkDay' | 'lastWorkDay' | 'startDate'> & {
  jobId: UUID;
};

async function getCancelledSlotProjections(
  tx: DatabaseTransaction,
  bayId?: UUID,
): Promise<Map<UUID, CancelledSlotProjection>> {
  const [offDays, rows] = await Promise.all([
    listWorkingCalendarOffDays(tx),
    findBoardBayRows(tx, bayId ? eq(jobBays.id, bayId) : undefined),
  ]);
  const cancelledJobIds = new Set(
    rows.flatMap((row) => row.slots.flatMap((slot) => (slot.job?.cancelledAt ? [slot.job.id] : []))),
  );

  if (cancelledJobIds.size === 0) {
    return new Map();
  }

  const bays = toProjectedBoard(rows, { offDays, today: getPlantDateNow() }).queues;
  const projections = new Map<UUID, CancelledSlotProjection>();

  for (const bay of bays) {
    for (const slot of bay.slots) {
      if (slot.kind !== 'work' || !cancelledJobIds.has(slot.jobId)) continue;
      projections.set(slot.id, {
        endDate: slot.endDate,
        firstWorkDay: slot.firstWorkDay,
        jobId: slot.jobId,
        lastWorkDay: slot.lastWorkDay,
        startDate: slot.startDate,
      });
    }
  }

  return projections;
}

async function assertCancelledSlotProjectionsUnchanged(
  tx: DatabaseTransaction,
  before: ReadonlyMap<UUID, CancelledSlotProjection>,
  bayId?: UUID,
): Promise<void> {
  if (before.size === 0) return;

  const after = await getCancelledSlotProjections(tx, bayId);
  for (const [slotId, projection] of before) {
    if (!hasSameProjectionDates(projection, after.get(slotId))) {
      throw new JobCancelledError(projection.jobId);
    }
  }
}

function hasSameProjectionDates(before: CancelledSlotProjection, after: CancelledSlotProjection | undefined): boolean {
  if (!after) return false;

  return (
    before.startDate === after.startDate &&
    before.endDate === after.endDate &&
    before.firstWorkDay === after.firstWorkDay &&
    before.lastWorkDay === after.lastWorkDay
  );
}

export async function listWorkingCalendarOffDays(db: Db | DatabaseTransaction) {
  const rows = await db
    .select({
      date: workingCalendarOffDays.date,
      label: workingCalendarOffDays.label,
    })
    .from(workingCalendarOffDays)
    .orderBy(asc(workingCalendarOffDays.date));

  return rows.map((row) => OffDay.parse(row));
}

export function createOrgWorkingCalendar(offDays: readonly OffDay[]): WorkingCalendar {
  return {
    orgOffDays: new Set(offDays.map((offDay) => offDay.date)),
  };
}

export function createBayWorkingCalendar(
  orgWorkingCalendar: WorkingCalendar,
  exceptions: readonly { date: string; direction: BayCalendarExceptionDirection }[],
): WorkingCalendar {
  return {
    ...orgWorkingCalendar,
    bayExceptions: new Map(exceptions.map((exception) => [exception.date, exception.direction])),
  };
}

export async function listBayCalendarExceptions(db: Db | DatabaseTransaction, bayId: UUID) {
  const rows = await db
    .select({
      bayId: jobBayCalendarExceptions.bayId,
      date: jobBayCalendarExceptions.date,
      direction: jobBayCalendarExceptions.direction,
      label: jobBayCalendarExceptions.label,
    })
    .from(jobBayCalendarExceptions)
    .where(eq(jobBayCalendarExceptions.bayId, bayId))
    .orderBy(asc(jobBayCalendarExceptions.date));

  return rows.map((row) => BayCalendarException.parse(row));
}

/** A Bay's effective calendar: org Off-Days overlaid with the Bay's Calendar Exceptions. */
export async function loadBayWorkingCalendar(db: Db | DatabaseTransaction, bayId: UUID): Promise<WorkingCalendar> {
  return createBayWorkingCalendar(
    createOrgWorkingCalendar(await listWorkingCalendarOffDays(db)),
    await listBayCalendarExceptions(db, bayId),
  );
}
