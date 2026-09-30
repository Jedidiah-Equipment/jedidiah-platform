import type { Db } from '@pkg/db';
import { partImportBatches, partImportBatchMembers } from '@pkg/db/equipment';
import { getNextCursor, type UUID } from '@pkg/schema';
import {
  type PartImportBatchDetail,
  PartImportBatchDetail as PartImportBatchDetailSchema,
  type PartImportBatchListInput,
  type PartImportBatchListResult,
  PartImportBatchListResult as PartImportBatchListResultSchema,
  type PartImportBatchMember,
  type PartImportBatchOutcome,
} from '@pkg/schema/equipment';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';

import { PartImportBatchNotFoundError } from './part-errors.js';

/** A batch as every read shows it: its own facts, and only the importing User's name. */
const batchColumns = {
  columns: {
    completedAt: true,
    createdCount: true,
    fileName: true,
    id: true,
    rejectedCount: true,
    unchangedCount: true,
    updatedCount: true,
  },
  with: { importedBy: { columns: { id: true, name: true } } },
} as const;

/** A label prints for what an import added; the Parts it only updated join when asked. */
function partImportBatchLabelOutcomes({ includeUpdated }: { includeUpdated: boolean }): PartImportBatchOutcome[] {
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
  const [rows, total] = await Promise.all([
    db.query.partImportBatches.findMany({
      ...batchColumns,
      offset: cursor,
      orderBy: [desc(partImportBatches.completedAt), desc(partImportBatches.id)],
      ...(limit === 0 ? {} : { limit }),
    }),
    db.$count(partImportBatches),
  ]);

  return PartImportBatchListResultSchema.parse({
    items: rows,
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
  const row = await db.query.partImportBatches.findFirst({
    columns: batchColumns.columns,
    where: eq(partImportBatches.id, batchId),
    with: {
      ...batchColumns.with,
      members: {
        columns: { lineNumber: true, outcome: true, partCode: true, partName: true },
        orderBy: asc(partImportBatchMembers.lineNumber),
        with: { part: { columns: { code: true, id: true, name: true, storageLocation: true } } },
      },
    },
  });
  if (!row) throw new PartImportBatchNotFoundError(batchId);

  const { members: memberRows, ...batch } = row;
  const members: PartImportBatchMember[] = memberRows.map((member) => ({
    importedCode: member.partCode,
    importedName: member.partName,
    lineNumber: member.lineNumber,
    outcome: member.outcome,
    part: member.part ?? null,
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
  const batch = await db.query.partImportBatches.findFirst({
    columns: { id: true },
    where: eq(partImportBatches.id, batchId),
  });
  if (!batch) throw new PartImportBatchNotFoundError(batchId);

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
