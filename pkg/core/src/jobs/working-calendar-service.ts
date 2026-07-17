import {
  type DatabaseTransaction,
  type Db,
  jobBayCalendarExceptions,
  jobBays,
  jobSlots,
  jobs,
  workingCalendarOffDays,
} from '@pkg/db';
import type { WorkingCalendar } from '@pkg/domain';
import {
  type AddBayCalendarExceptionInput,
  AddBayCalendarExceptionResult,
  BayCalendarException,
  type BayCalendarExceptionDirection,
  OffDay,
  type RemoveBayCalendarExceptionInput,
  RemoveBayCalendarExceptionResult,
  type ToggleOffDayInput,
  ToggleOffDayResult,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { JobBayNotFoundError, JobCancelledError } from './job-errors.js';

export async function toggleOffDay({ db, input }: { db: Db; input: ToggleOffDayInput }): Promise<ToggleOffDayResult> {
  return db.transaction(async (tx) => {
    if (!input.isOffDay) {
      await tx.delete(workingCalendarOffDays).where(eq(workingCalendarOffDays.date, input.date));

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

    await assertBayHasNoCancelledJobSlots(tx, bay.id);

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

    await assertBayHasNoCancelledJobSlots(tx, bay.id);

    const [row] = await tx
      .delete(jobBayCalendarExceptions)
      .where(and(eq(jobBayCalendarExceptions.bayId, bay.id), eq(jobBayCalendarExceptions.date, input.date)))
      .returning({
        bayId: jobBayCalendarExceptions.bayId,
        date: jobBayCalendarExceptions.date,
        direction: jobBayCalendarExceptions.direction,
        label: jobBayCalendarExceptions.label,
      });

    return RemoveBayCalendarExceptionResult.parse({ exception: row ?? null });
  });
}

async function assertBayHasNoCancelledJobSlots(tx: DatabaseTransaction, bayId: UUID): Promise<void> {
  const [cancelledJob] = await tx
    .select({ id: jobs.id })
    .from(jobSlots)
    .innerJoin(jobs, eq(jobSlots.jobId, jobs.id))
    .where(and(eq(jobSlots.bayId, bayId), isNotNull(jobs.cancelledAt)))
    .limit(1);

  if (cancelledJob) {
    throw new JobCancelledError(cancelledJob.id);
  }
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
