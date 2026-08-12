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
 * Job rather than a breakdown inside it. The two read the same money off the same two expressions
 * in `job-stock-facts.ts`, so neither can drift into pricing a draw the other way:
 *
 * - **Never re-priced.** The sum comes off the stamped `unitCost` on the Job's own movement rows,
 *   so a receipt landing after the draw cannot move a figure the plant has already read.
 * - **Unpriced is unknown, not free.** A Job still holding draws with no cost reports `null`. Its
 *   costed rows would total to something smaller than the truth, and a number that reads as
 *   authoritative is worse than an empty cell.
 *
 * Both aggregate **per Part** and only then per Job, because "is this unpriced" is a question about
 * a Part's own pool. A whole-Job net would let one Part's null-stamped row cancel another's unpriced
 * draw — a return against an empty pool is stamped null and carries a positive delta, so it nets
 * against an unpriced Checkout elsewhere on the Job — and the Job would report a costed total with
 * unpriced material silently counted as free, while the variance report on the same Job read null.
 *
 * A Job with no draws at all cost nothing, so it is absent from the map and its caller reads zero —
 * distinct from the null a Job earns by holding material nobody has priced yet.
 */
/**
 * One Job's cost off {@link sumJobDrawnCosts}' map, under the absence rule the map's own contract
 * states: a Job that is missing entirely drew nothing at all and cost zero, while a Job present with
 * `null` holds material nobody has priced. Every reader of the map goes through this, so no caller can
 * read an absent Job as unpriced or an unpriced one as free.
 */
export function readJobDrawnCost(costByJobId: Map<UUID, number | null>, jobId: UUID): number | null {
  return costByJobId.has(jobId) ? (costByJobId.get(jobId) ?? null) : 0;
}

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
    .groupBy(stockMovements.jobId, stockMovements.partId);

  // Summed and latched separately, so the answer cannot depend on which Part's row arrived first.
  const costedTotals = new Map<UUID, number>();
  const unpricedJobIds = new Set<UUID>();

  for (const row of rows) {
    if (!row.jobId) continue;

    const jobId = row.jobId as UUID;

    costedTotals.set(jobId, (costedTotals.get(jobId) ?? 0) + row.costedValue);

    // One unpriced Part latches the whole Job unpriced, exactly as `sumActualCosts` latches the
    // variance report's total — a Job is no better priced than its worst-known Part.
    if (toLedgerQuantity(row.uncostedDrawnQuantity) > 0) {
      unpricedJobIds.add(jobId);
    }
  }

  return new Map([...costedTotals].map(([jobId, total]) => [jobId, unpricedJobIds.has(jobId) ? null : total] as const));
}
