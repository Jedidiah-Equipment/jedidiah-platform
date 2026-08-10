import { type Db, stockMovements } from '@pkg/db';
import { JOB_STOCK_MOVEMENT_TYPES, type UUID } from '@pkg/schema';
import { and, inArray } from 'drizzle-orm';

import { drawnCostedValueExpression, uncostedDrawnQuantityExpression } from './job-stock-facts.js';
import { toLedgerQuantity } from './ledger.js';

/**
 * What a set of Jobs drew in material, in money, at the price each draw was stamped with.
 *
 * The per-Part answer to the same question is `getJobMaterialVariance`, which one Job's report
 * reads; this is the whole-Job total, several Jobs at a time, for callers that want a cost beside a
 * Job rather than a breakdown inside it. The two group the same rows differently and read the same
 * money off the same two expressions in `job-stock-facts.ts`, so neither can drift into pricing a
 * draw the other way:
 *
 * - **Never re-priced.** The sum comes off the stamped `unitCost` on the Job's own movement rows,
 *   so a receipt landing after the draw cannot move a figure the plant has already read.
 * - **Unpriced is unknown, not free.** A Job still holding draws with no cost reports `null`. Its
 *   costed rows would total to something smaller than the truth, and a number that reads as
 *   authoritative is worse than an empty cell.
 *
 * A Job with no draws at all cost nothing, so it is absent from the map and its caller reads zero —
 * distinct from the null a Job earns by holding material nobody has priced yet.
 */
export async function sumJobDrawnCosts({
  db,
  jobIds,
}: {
  db: Db;
  jobIds: readonly UUID[];
}): Promise<Map<UUID, number | null>> {
  if (jobIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      costedValue: drawnCostedValueExpression,
      jobId: stockMovements.jobId,
      uncostedDrawnQuantity: uncostedDrawnQuantityExpression,
    })
    .from(stockMovements)
    .where(and(inArray(stockMovements.jobId, jobIds), inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES)))
    .groupBy(stockMovements.jobId);

  return new Map(
    rows.flatMap((row) =>
      row.jobId
        ? [[row.jobId as UUID, toLedgerQuantity(row.uncostedDrawnQuantity) > 0 ? null : row.costedValue] as const]
        : [],
    ),
  );
}
