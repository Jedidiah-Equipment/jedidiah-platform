import {
  type DatabaseTransaction,
  type Db,
  getUniqueViolationConstraint,
  jobBayOperatorAssignments,
  jobBays,
  user,
} from '@pkg/db';
import {
  type AuthId,
  Bay,
  BayOperator,
  BayOperatorListResult,
  type JobBayAssignOperatorInput,
  JobBayAssignOperatorResult,
  type JobBayCreateInput,
  JobBayCreateResult,
  type JobBayListInput,
  type JobBayListResult,
  type JobBayOperatorAssignmentHistoryInput,
  JobBayOperatorAssignmentHistoryResult,
  type JobBayRenameInput,
  JobBayRenameResult,
  type JobBaySetDisabledInput,
  JobBaySetDisabledResult,
  type JobBayUnassignOperatorInput,
  JobBayUnassignOperatorResult,
} from '@pkg/schema';
import { and, asc, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditEvent,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import {
  JobBayAlreadyAssignedError,
  JobBayNotFoundError,
  JobBayOperatorAssignmentDeniedError,
  JobBayOperatorAssignmentNotFoundError,
  JobBayOperatorNotFoundError,
  JobBayOperatorRoleDeniedError,
} from './job-errors.js';

type JobBayRow = typeof jobBays.$inferSelect;
type BayOperatorRow = Pick<typeof user.$inferSelect, 'email' | 'id' | 'image' | 'name'>;

export type OpenOperatorAssignmentsRow = {
  operatorAssignments: { operator: BayOperatorRow }[];
};

export function getCurrentBayOperator(row: OpenOperatorAssignmentsRow): BayOperator | null {
  const operator = row.operatorAssignments[0]?.operator;

  return operator ? mapBayOperator(operator) : null;
}

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
  const rows = await selectJobBayRows(db, getJobBayListWhere(input));

  return {
    items: rows.map((row) => mapJobBay(row, getCurrentBayOperator(row))),
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

    return JobBayCreateResult.parse({ bay: mapJobBay(bay, null) });
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

export async function listBayOperators({ db }: { db: Db | DatabaseTransaction }): Promise<BayOperatorListResult> {
  const rows = await db
    .select({
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
    })
    .from(user)
    .where(eq(user.role, 'bay-operator'))
    .orderBy(asc(user.name), asc(user.email), asc(user.id));

  return BayOperatorListResult.parse({ operators: rows.map(mapBayOperator) });
}

export async function listBayOperatorAssignmentHistory({
  db,
  input,
}: {
  db: Db | DatabaseTransaction;
  input: JobBayOperatorAssignmentHistoryInput;
}): Promise<JobBayOperatorAssignmentHistoryResult> {
  await assertJobBayExists(db, input.bayId);

  const rows = await db
    .select({
      assignedAt: jobBayOperatorAssignments.assignedAt,
      email: user.email,
      id: jobBayOperatorAssignments.id,
      image: user.image,
      name: user.name,
      operatorUserId: user.id,
      unassignedAt: jobBayOperatorAssignments.unassignedAt,
    })
    .from(jobBayOperatorAssignments)
    .innerJoin(user, eq(jobBayOperatorAssignments.operatorUserId, user.id))
    .where(eq(jobBayOperatorAssignments.bayId, input.bayId))
    .orderBy(desc(jobBayOperatorAssignments.assignedAt), desc(jobBayOperatorAssignments.id));

  return JobBayOperatorAssignmentHistoryResult.parse({
    items: rows.map((row) => ({
      assignedAt: row.assignedAt,
      id: row.id,
      operator: mapBayOperator({
        email: row.email,
        id: row.operatorUserId,
        image: row.image,
        name: row.name,
      }),
      unassignedAt: row.unassignedAt,
    })),
  });
}

export async function assignJobBayOperator({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobBayAssignOperatorInput;
}): Promise<JobBayAssignOperatorResult> {
  return db.transaction(async (tx) => {
    const bay = await getJobBayForUpdate(tx, input.bayId);

    if (bay.disabledAt) {
      throw new JobBayOperatorAssignmentDeniedError('This Bay is disabled and cannot accept new operator assignments.');
    }

    const operator = await getAssignableBayOperatorForUpdate(tx, input.operatorUserId);

    // The partial unique index on open assignments is the canonical one-operator-per-bay guard;
    // the bay row lock above only serializes assigns against bay updates.
    try {
      await tx.insert(jobBayOperatorAssignments).values({
        assignedAt: new Date(),
        bayId: input.bayId,
        operatorUserId: input.operatorUserId,
      });
    } catch (error) {
      if (getUniqueViolationConstraint(error)?.includes('job_bay_operator_assignment_open_bay_unique')) {
        throw new JobBayAlreadyAssignedError();
      }

      throw error;
    }

    await recordBayOperatorAssignmentAudit({
      actorUserId,
      bay,
      db: tx,
      from: null,
      to: operator,
    });

    return JobBayAssignOperatorResult.parse({ bay: mapJobBay(bay, mapBayOperator(operator)) });
  });
}

export async function unassignJobBayOperator({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobBayUnassignOperatorInput;
}): Promise<JobBayUnassignOperatorResult> {
  return db.transaction(async (tx) => {
    const bay = await getJobBayForUpdate(tx, input.bayId);
    const currentAssignment = await getCurrentAssignmentForUpdate(tx, input.bayId);

    if (!currentAssignment) {
      throw new JobBayOperatorAssignmentNotFoundError(input.bayId);
    }

    const unassignedAt = new Date();
    const [closedAssignment] = await tx
      .update(jobBayOperatorAssignments)
      .set({ unassignedAt })
      .where(eq(jobBayOperatorAssignments.id, currentAssignment.assignmentId))
      .returning();

    if (!closedAssignment) {
      throw new JobBayOperatorAssignmentNotFoundError(input.bayId);
    }

    await recordBayOperatorAssignmentAudit({
      actorUserId,
      bay,
      db: tx,
      from: currentAssignment.operator,
      to: null,
    });

    return JobBayUnassignOperatorResult.parse({ bay: mapJobBay(bay, null) });
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
  result: { parse: (input: { bay: Bay }) => TResult };
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

    const currentOperator = await getCurrentBayOperatorByBayId(tx, bay.id);

    return result.parse({ bay: mapJobBay(bay, currentOperator) });
  });
}

async function getJobBayForUpdate(tx: DatabaseTransaction, id: string): Promise<JobBayRow> {
  const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, id)).for('update');

  if (!bay) {
    throw new JobBayNotFoundError(id);
  }

  return bay;
}

async function assertJobBayExists(db: Db | DatabaseTransaction, id: string): Promise<void> {
  const [bay] = await db.select({ id: jobBays.id }).from(jobBays).where(eq(jobBays.id, id)).limit(1);

  if (!bay) {
    throw new JobBayNotFoundError(id);
  }
}

async function selectJobBayRows(db: Db | DatabaseTransaction, where?: SQL) {
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
    },
  });
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

async function getCurrentBayOperatorByBayId(db: Db | DatabaseTransaction, bayId: string): Promise<BayOperator | null> {
  const [row] = await db
    .select({
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
    })
    .from(jobBayOperatorAssignments)
    .innerJoin(user, eq(jobBayOperatorAssignments.operatorUserId, user.id))
    .where(and(eq(jobBayOperatorAssignments.bayId, bayId), isNull(jobBayOperatorAssignments.unassignedAt)));

  return row ? mapBayOperator(row) : null;
}

export async function listOpenBayOperatorAssignmentBayNames({
  db,
  userId,
}: {
  db: Db | DatabaseTransaction;
  userId: string;
}): Promise<string[]> {
  const rows = await db
    .select({
      bayName: jobBays.name,
    })
    .from(jobBayOperatorAssignments)
    .innerJoin(jobBays, eq(jobBayOperatorAssignments.bayId, jobBays.id))
    .where(and(eq(jobBayOperatorAssignments.operatorUserId, userId), isNull(jobBayOperatorAssignments.unassignedAt)))
    .orderBy(asc(jobBays.department), asc(jobBays.name), asc(jobBays.id));

  return rows.map((row) => row.bayName);
}

function mapJobBay(row: JobBayRow, currentOperator: BayOperator | null): Bay {
  return Bay.parse({
    ...row,
    currentOperator,
  });
}

function mapBayOperator(row: BayOperatorRow): BayOperator {
  return BayOperator.parse({
    email: row.email,
    id: row.id,
    name: row.name,
    thumbnailDataUrl: row.image,
  });
}

async function getAssignableBayOperatorForUpdate(
  tx: DatabaseTransaction,
  operatorUserId: AuthId,
): Promise<BayOperatorRow> {
  const [operator] = await tx
    .select({
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, operatorUserId))
    .for('update');

  if (!operator) {
    throw new JobBayOperatorNotFoundError(operatorUserId);
  }

  if (operator.role !== 'bay-operator') {
    throw new JobBayOperatorRoleDeniedError();
  }

  return operator;
}

async function getCurrentAssignmentForUpdate(
  tx: DatabaseTransaction,
  bayId: string,
): Promise<{ assignmentId: string; operator: BayOperatorRow } | null> {
  const [assignment] = await tx
    .select({
      assignmentId: jobBayOperatorAssignments.id,
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
    })
    .from(jobBayOperatorAssignments)
    .innerJoin(user, eq(jobBayOperatorAssignments.operatorUserId, user.id))
    .where(and(eq(jobBayOperatorAssignments.bayId, bayId), isNull(jobBayOperatorAssignments.unassignedAt)))
    .for('update');

  if (!assignment) {
    return null;
  }

  return {
    assignmentId: assignment.assignmentId,
    operator: assignment,
  };
}

async function recordBayOperatorAssignmentAudit({
  actorUserId,
  bay,
  db,
  from,
  to,
}: {
  actorUserId: AuthId;
  bay: JobBayRow;
  db: DatabaseTransaction;
  from: BayOperatorRow | null;
  to: BayOperatorRow | null;
}): Promise<void> {
  await recordAuditEvent({
    action: 'updated',
    actorUserId,
    changes: {
      currentOperator: {
        from: from ? formatBayOperatorAuditValue(from) : null,
        to: to ? formatBayOperatorAuditValue(to) : null,
      },
    },
    db,
    descriptor: jobBayAuditDescriptor,
    entityId: bay.id,
    record: { name: bay.name },
  });
}

function formatBayOperatorAuditValue(operator: BayOperatorRow): string {
  return `${operator.name} <${operator.email}>`;
}
