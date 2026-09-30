import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import { partImportBatches, partImportBatchMembers } from '@pkg/db/equipment';
import { getNextCursor, type UUID } from '@pkg/schema';
import {
  PartImportBatch,
  type PartImportBatchDetail,
  PartImportBatchDetail as PartImportBatchDetailSchema,
  type PartImportBatchListInput,
  type PartImportBatchListResult,
  PartImportBatchListResult as PartImportBatchListResultSchema,
  type PartImportBatchMember,
  type PartImportBatchOutcome,
} from '@pkg/schema/equipment';
import { and, asc, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';

import { PartImportBatchNotFoundError } from './part-errors.js';

/** A label prints for what an import added; the Parts it only updated join when asked. */
export function partImportBatchLabelOutcomes({
  includeUpdated,
}: {
  includeUpdated: boolean;
}): PartImportBatchOutcome[] {
  return includeUpdated ? ['created', 'updated'] : ['created'];
}

/**
 * Newest first across every importer: the batch someone else ran is as much the stores' to label as
 * their own. The id breaks a tie between two imports that finished in the same instant.
 */
export async function listPartImportBatches({
  db,
  input,
}: {
  db: Db;
  input: PartImportBatchListInput;
}): Promise<PartImportBatchListResult> {
  const { cursor, limit } = input;
  const query = batchQuery(db).orderBy(desc(partImportBatches.completedAt), desc(partImportBatches.id)).offset(cursor);
  const [rows, total] = await Promise.all([limit === 0 ? query : query.limit(limit), db.$count(partImportBatches)]);

  return PartImportBatchListResultSchema.parse({
    items: rows.map(toBatch),
    nextCursor: getNextCursor({ count: rows.length, cursor, total }),
    total,
  });
}

/**
 * One batch with every successful row it saved, each beside the Part it names now. A Part renamed
 * since shows its current details next to what was imported; a Part no longer in the catalog shows
 * none and prints no label.
 */
export async function getPartImportBatch({ batchId, db }: { batchId: UUID; db: Db }): Promise<PartImportBatchDetail> {
  const batch = await loadBatch({ batchId, db });
  const memberRows = await db.query.partImportBatchMembers.findMany({
    columns: { lineNumber: true, outcome: true, partCode: true, partName: true },
    orderBy: asc(partImportBatchMembers.lineNumber),
    where: eq(partImportBatchMembers.batchId, batchId),
    with: { part: { columns: { code: true, id: true, name: true, storageLocation: true } } },
  });
  const members: PartImportBatchMember[] = memberRows.map((row) => ({
    importedCode: row.partCode,
    importedName: row.partName,
    lineNumber: row.lineNumber,
    outcome: row.outcome,
    part: row.part ?? null,
  }));

  return PartImportBatchDetailSchema.parse({
    batch,
    labelCounts: {
      created: countLabelParts(members, { includeUpdated: false }),
      createdAndUpdated: countLabelParts(members, { includeUpdated: true }),
    },
    members,
  });
}

/**
 * The distinct current Parts one batch's label selection prints. Members a merge pointed at one
 * survivor collapse to that one Part; members whose Part is gone drop out.
 */
export async function partImportBatchLabelPartIds({
  batchId,
  db,
  includeUpdated,
}: {
  batchId: UUID;
  db: Db;
  includeUpdated: boolean;
}): Promise<UUID[]> {
  await loadBatch({ batchId, db });

  const rows = await db
    .selectDistinct({ id: partImportBatchMembers.partId })
    .from(partImportBatchMembers)
    .where(
      and(
        eq(partImportBatchMembers.batchId, batchId),
        inArray(partImportBatchMembers.outcome, partImportBatchLabelOutcomes({ includeUpdated })),
        isNotNull(partImportBatchMembers.partId),
      ),
    );

  return rows.flatMap((row) => (row.id === null ? [] : [row.id]));
}

function countLabelParts(members: readonly PartImportBatchMember[], { includeUpdated }: { includeUpdated: boolean }) {
  const outcomes = partImportBatchLabelOutcomes({ includeUpdated });

  return new Set(
    members.flatMap((member) => (member.part && outcomes.includes(member.outcome) ? [member.part.id] : [])),
  ).size;
}

async function loadBatch({ batchId, db }: { batchId: UUID; db: Db }): Promise<PartImportBatch> {
  const [row] = await batchQuery(db, eq(partImportBatches.id, batchId)).limit(1);
  if (!row) throw new PartImportBatchNotFoundError(batchId);

  return PartImportBatch.parse(toBatch(row));
}

function batchQuery(db: Db | DatabaseTransaction, where?: SQL) {
  return db
    .select({
      completedAt: partImportBatches.completedAt,
      createdCount: partImportBatches.createdCount,
      fileName: partImportBatches.fileName,
      id: partImportBatches.id,
      importedById: user.id,
      importedByName: user.name,
      rejectedCount: partImportBatches.rejectedCount,
      unchangedCount: partImportBatches.unchangedCount,
      updatedCount: partImportBatches.updatedCount,
    })
    .from(partImportBatches)
    .leftJoin(user, eq(user.id, partImportBatches.importedByUserId))
    .where(where)
    .$dynamic();
}

type BatchRow = Awaited<ReturnType<ReturnType<typeof batchQuery>['execute']>>[number];

/** The row as the batch schema reads it; parsing turns its Date into the wire's ISO string. */
function toBatch({ importedById, importedByName, ...row }: BatchRow) {
  return {
    ...row,
    importedBy: importedById !== null && importedByName !== null ? { id: importedById, name: importedByName } : null,
  };
}
