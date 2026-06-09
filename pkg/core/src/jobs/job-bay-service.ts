import { type DatabaseTransaction, type Db, jobBays } from '@pkg/db';
import {
  type AuthId,
  Bay,
  type JobBayCreateInput,
  JobBayCreateResult,
  type JobBayListInput,
  type JobBayListResult,
  type JobBayRenameInput,
  JobBayRenameResult,
  type JobBaySetDisabledInput,
  JobBaySetDisabledResult,
} from '@pkg/schema';
import { asc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { JobBayNotFoundError } from './job-errors.js';

type JobBayRow = typeof jobBays.$inferSelect;

export const jobBayAuditDescriptor = defineAuditDescriptor<JobBayRow>({
  entityType: 'job_bay',
  noun: 'Bay',
  primaryLabelField: 'name',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    department: row.department,
    disabledAt: row.disabledAt,
    name: row.name,
    scheduleOrigin: row.scheduleOrigin,
  }),
});

export async function listJobBays({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input: JobBayListInput;
}): Promise<JobBayListResult> {
  return {
    items: await selectJobBays(db, getJobBayListWhere(input)),
  };
}

export async function createJobBay({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobBayCreateInput;
}): Promise<JobBayCreateResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx
      .insert(jobBays)
      .values({
        department: input.department,
        name: input.name,
      })
      .returning();

    if (!bay) {
      throw new Error('Job bay insert did not return a row');
    }

    await recordAuditCreate({ db: tx, descriptor: jobBayAuditDescriptor, actorUserId, input: bay });

    return JobBayCreateResult.parse({ bay });
  });
}

export async function renameJobBay({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobBayRenameInput;
}): Promise<JobBayRenameResult> {
  return updateJobBay({
    actorUserId,
    db,
    id: input.id,
    set: {
      name: input.name,
      updatedAt: new Date(),
    },
    result: JobBayRenameResult,
  });
}

export async function setJobBayDisabled({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobBaySetDisabledInput;
}): Promise<JobBaySetDisabledResult> {
  return updateJobBay({
    actorUserId,
    db,
    id: input.id,
    set: {
      disabledAt: input.disabled ? new Date() : null,
      updatedAt: new Date(),
    },
    result: JobBaySetDisabledResult,
  });
}

async function updateJobBay<TResult>({
  actorUserId,
  db,
  id,
  result,
  set,
}: {
  actorUserId: AuthId;
  db: Db;
  id: string;
  result: { parse: (input: { bay: JobBayRow }) => TResult };
  set: Partial<typeof jobBays.$inferInsert>;
}): Promise<TResult> {
  return db.transaction(async (tx) => {
    const before = await getJobBayForUpdate(tx, id);
    const [bay] = await tx.update(jobBays).set(set).where(eq(jobBays.id, id)).returning();

    if (!bay) {
      throw new Error('Job bay update did not return a row');
    }

    const changes = diffAuditUpdate(jobBayAuditDescriptor, before, bay);
    if (changes) {
      await recordAuditUpdate({ db: tx, descriptor: jobBayAuditDescriptor, actorUserId, after: bay, changes });
    }

    return result.parse({ bay });
  });
}

async function getJobBayForUpdate(tx: DatabaseTransaction, id: string): Promise<JobBayRow> {
  const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, id)).for('update');

  if (!bay) {
    throw new JobBayNotFoundError(id);
  }

  return bay;
}

async function selectJobBays(db: Db | DatabaseTransaction, where?: SQL) {
  const rows = await db.query.jobBays.findMany({
    where,
    orderBy: [asc(jobBays.department), asc(jobBays.name), asc(jobBays.id)],
  });

  return rows.map((row) => Bay.parse(row));
}

function getJobBayListWhere(input: JobBayListInput): SQL | undefined {
  if (input.filters.isDisabled === true) {
    return isNotNull(jobBays.disabledAt);
  }

  if (input.filters.isDisabled === false) {
    return isNull(jobBays.disabledAt);
  }

  return undefined;
}
