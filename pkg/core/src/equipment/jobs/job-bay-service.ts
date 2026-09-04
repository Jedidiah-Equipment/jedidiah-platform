import {
  type DatabaseTransaction,
  type Db,
  getForeignKeyViolationConstraint,
  getUniqueViolationConstraint,
  user,
} from '@pkg/db';
import { jobBayOperatorAssignments, jobBays, jobSlots, productBays } from '@pkg/db/equipment';
import { getPlantDateNow } from '@pkg/domain';
import type { AuthId } from '@pkg/schema';
import {
  Bay,
  BayOperator,
  BayOperatorListResult,
  type JobBayAssignOperatorInput,
  JobBayAssignOperatorResult,
  type JobBayCreateInput,
  JobBayCreateResult,
  type JobBayDeleteInput,
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
} from '@pkg/schema/equipment';
import { and, asc, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  recordAuditCreate,
  recordAuditDelete,
  recordAuditEvent,
} from '../audit/audit-service.js';
import { mutateEntity } from '../audit/mutate-entity.js';
import {
  JobBayAlreadyAssignedError,
  JobBayInUseError,
  JobBayNotFoundError,
  JobBayOperatorAssignmentDeniedError,
  JobBayOperatorAssignmentNotFoundError,
  JobBayOperatorNotFoundError,
  JobBayOperatorRoleDeniedError,
} from './job-errors.js';

type JobBayRow = typeof jobBays.$inferSelect;
export type BayOperatorRow = Pick<typeof user.$inferSelect, 'email' | 'id' | 'image' | 'name'>;

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
        scheduleOrigin: getPlantDateNow(),
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
  return mutateEntity({
    actorUserId,
    db,
    descriptor: jobBayAuditDescriptor,
    id: input.id,
    notFound: () => new JobBayNotFoundError(input.id),
    project: (tx, bay) => projectJobBay(tx, bay, JobBayRenameResult),
    set: () => ({
      name: input.name,
      updatedAt: new Date(),
    }),
    table: jobBays,
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
  return mutateEntity({
    actorUserId,
    db,
    descriptor: jobBayAuditDescriptor,
    id: input.id,
    notFound: () => new JobBayNotFoundError(input.id),
    project: (tx, bay) => projectJobBay(tx, bay, JobBaySetDisabledResult),
    set: () => ({
      disabledAt: input.disabled ? new Date() : null,
      updatedAt: new Date(),
    }),
    table: jobBays,
  });
}

/**
 * Removes a Bay added in error, which is the only Bay a delete can reach.
 *
 * A Bay that any Slot, Product Bay, or Operator Assignment references — open or closed — carries
 * history the plant still reads, so it is refused here and disabled instead. Bay Calendar Exceptions
 * are per-Bay overrides that mean nothing without their Bay, and the schema already cascades them.
 */
export async function deleteJobBay({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobBayDeleteInput;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const bay = await getJobBayForUpdate(tx, input.id);

    await assertJobBayUnreferenced(tx, input.id);

    // The checks above name what is holding the Bay; the FK is the backstop that keeps a referrer
    // added later failing closed as a refusal rather than a 500.
    try {
      await tx.delete(jobBays).where(eq(jobBays.id, input.id));
    } catch (error) {
      if (getForeignKeyViolationConstraint(error)) {
        throw new JobBayInUseError(input.id, 'Something still references this Bay. Disable it instead of deleting it.');
      }

      throw error;
    }

    await recordAuditDelete({ db: tx, descriptor: jobBayAuditDescriptor, actorUserId, input: bay });
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

async function projectJobBay<TResult>(
  tx: DatabaseTransaction,
  bay: JobBayRow,
  result: { parse: (input: { bay: Bay }) => TResult },
): Promise<TResult> {
  const currentOperator = await getCurrentBayOperatorByBayId(tx, bay.id);

  return result.parse({ bay: mapJobBay(bay, currentOperator) });
}

async function getJobBayForUpdate(tx: DatabaseTransaction, id: string): Promise<JobBayRow> {
  const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, id)).for('update');

  if (!bay) {
    throw new JobBayNotFoundError(id);
  }

  return bay;
}

async function assertJobBayUnreferenced(tx: DatabaseTransaction, id: string): Promise<void> {
  const [slot] = await tx.select({ id: jobSlots.id }).from(jobSlots).where(eq(jobSlots.bayId, id)).limit(1);

  if (slot) {
    throw new JobBayInUseError(id, 'This Bay has Slots on its queue. Disable it instead of deleting it.');
  }

  const [productBay] = await tx
    .select({ productId: productBays.productId })
    .from(productBays)
    .where(eq(productBays.bayId, id))
    .limit(1);

  if (productBay) {
    throw new JobBayInUseError(id, 'This Bay is a default Bay for a Product. Disable it instead of deleting it.');
  }

  const [assignment] = await tx
    .select({ id: jobBayOperatorAssignments.id })
    .from(jobBayOperatorAssignments)
    .where(eq(jobBayOperatorAssignments.bayId, id))
    .limit(1);

  if (assignment) {
    throw new JobBayInUseError(id, 'This Bay has Operator history. Disable it instead of deleting it.');
  }
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

/**
 * The one rule for naming a shop-floor person against work: the account must exist and must be a Bay
 * Operator. Shared with Department Crew so a crew member and an Operator Assignment can never come to
 * disagree about who is on the floor.
 */
export async function getAssignableBayOperatorForUpdate(
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
