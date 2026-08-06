import { type Db, parts, stockMovements } from '@pkg/db';
import type { JobMaterialVarianceResult, UUID } from '@pkg/schema';
import { JOB_STOCK_MOVEMENT_TYPES, JobMaterialVarianceResult as JobMaterialVarianceResultSchema } from '@pkg/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { loadCfoQuantitiesByPart, loadJobStockJob } from './job-stock-facts.js';
import { toLedgerQuantity } from './ledger.js';
import { sumBy } from './row-grouping.js';

/**
 * What a Job planned in material against what it actually took, priced at what the draws were
 * stamped with (spec §3, §12). The report the plant reads at close-out, so it is deliberately
 * unwindowed: a completed or closed-out Job is exactly when this question gets asked.
 *
 * Three things it does not do, each on purpose:
 *
 * - **It never re-prices.** Cost is summed from the stamped `unitCost` on the Job's own movement
 *   rows, never from today's moving average, so a receipt landing after the draw cannot move a
 *   number the shop has already read. An uncosted draw makes the row null — "no cost yet" — rather
 *   than contributing zero, which would report unpriced material as free.
 * - **It carries no planned cost.** The CFO froze quantities only, so there is nothing honest to
 *   price it at; estimated-versus-actual is the Job's own estimate snapshot, not this read.
 * - **It ignores length buckets.** Variance is per Part: a Job that drew a 6 m and a 3 m length of
 *   the same channel is over or under on the channel, and both draws carry their own stamped cost.
 */
export async function getJobMaterialVariance({
  db,
  jobId,
}: {
  db: Db;
  jobId: UUID;
}): Promise<JobMaterialVarianceResult> {
  const job = await loadJobStockJob({ db, jobId });
  const [plannedByPart, drawRows] = await Promise.all([
    loadCfoQuantitiesByPart({ db, jobId }),
    db
      .select({
        // Draws leave stock, so their deltas are negative and a return's is positive: negating the
        // sum turns the ledger's signs into what the Job is holding, in quantity and in money.
        actualCost: sql<number>`(-sum(${stockMovements.delta} * ${stockMovements.unitCost}))::double precision`,
        drawnQuantity: sql<number>`(-sum(${stockMovements.delta}))::double precision`,
        partId: stockMovements.partId,
        // A null `unitCost` drops out of the SQL sum silently, which would price unpriced material
        // at zero. Counting those rows is what lets the whole Part report as "no cost yet" instead.
        uncostedDraws: sql<number>`count(*) filter (where ${stockMovements.unitCost} is null)::int`,
      })
      .from(stockMovements)
      .where(and(eq(stockMovements.jobId, jobId), inArray(stockMovements.movementType, JOB_STOCK_MOVEMENT_TYPES)))
      .groupBy(stockMovements.partId),
  ]);

  const drawsByPart = new Map(drawRows.map((row) => [row.partId, row]));
  const partIds = [...new Set([...plannedByPart.keys(), ...drawsByPart.keys()])];

  if (partIds.length === 0) {
    return JobMaterialVarianceResultSchema.parse({ items: [], job, offCfoActualCost: 0, totalActualCost: 0 });
  }

  const partRows = await db
    .select({ code: parts.code, id: parts.id, name: parts.name, unitOfMeasure: parts.unitOfMeasure })
    .from(parts)
    .where(inArray(parts.id, partIds))
    .orderBy(asc(parts.code), asc(parts.id));

  const items = partRows.map((part) => {
    const draws = drawsByPart.get(part.id);
    const plannedQuantity = toLedgerQuantity(plannedByPart.get(part.id) ?? 0);
    const drawnQuantity = toLedgerQuantity(draws?.drawnQuantity ?? 0);

    return {
      actualCost: draws === undefined ? 0 : draws.uncostedDraws > 0 ? null : draws.actualCost,
      drawnQuantity,
      partCode: part.code,
      partId: part.id,
      partName: part.name,
      plannedQuantity,
      unitOfMeasure: part.unitOfMeasure,
      varianceQuantity: toLedgerQuantity(drawnQuantity - plannedQuantity),
    };
  });

  return JobMaterialVarianceResultSchema.parse({
    items,
    job,
    offCfoActualCost: sumActualCosts(items.filter((item) => item.plannedQuantity === 0)),
    totalActualCost: sumActualCosts(items),
  });
}

/** Σ, but a single unpriced Part makes the whole total unpriced rather than quietly smaller. */
function sumActualCosts(items: ReadonlyArray<{ actualCost: number | null }>): number | null {
  return items.some((item) => item.actualCost === null) ? null : sumBy(items, (item) => item.actualCost ?? 0);
}
