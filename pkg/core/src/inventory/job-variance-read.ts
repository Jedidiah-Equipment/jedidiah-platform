import { type Db, parts, stockMovements } from '@pkg/db';
import type { JobMaterialVarianceResult, JobStockMovementType, UUID } from '@pkg/schema';
import {
  isOffCfo,
  JOB_STOCK_MOVEMENT_TYPES,
  JobMaterialVarianceResult as JobMaterialVarianceResultSchema,
} from '@pkg/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

/** Bound as a parameter through the movement-type union, so a renamed type fails to compile here. */
const CHECKOUT: JobStockMovementType = 'checkout';

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
 *
 * It reads the same facts as `listJobStock` and deliberately does not go through it. That read
 * serves the Job's stock tab, where buying is decided, so it also carries free stock and on-order —
 * and those come from `loadPlantStockPosition`, a scan of open commitments across every Part in the
 * plant. This report answers for one Job's money and never shows a free-stock figure, so routing it
 * through that read would buy nothing and pay for the whole plant to answer it. The facts the two
 * genuinely share live in `job-stock-facts.ts`, which is what keeps them from drifting apart.
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
        // sums turns the ledger's signs into what the Job is holding, in quantity and in money.
        //
        // Only the costed rows are summed, and the total starts at zero rather than null, so what
        // comes back is always "the value we can account for" — never a null standing in for both
        // "nothing was drawn" and "something was drawn we cannot price".
        costedValue: sql<number>`(-coalesce(sum(${stockMovements.delta} * ${stockMovements.unitCost})
          filter (where ${stockMovements.unitCost} is not null), 0))::double precision`,
        drawnQuantity: sql<number>`(-coalesce(sum(${stockMovements.delta}), 0))::double precision`,
        // Whether anything was drawn that we cannot price — the one fact that makes the Part's cost
        // unknowable rather than merely small, stated on its own instead of inferred from a count.
        //
        // Draws only. A return is stamped null whenever its bucket's pool has nothing outstanding
        // left to reverse — the offcut handed back in a length the Job never drew, or the piece
        // returned past what it still held — and both of those give back exactly no value, which
        // the sum already reflects. Counting them would let one returned offcut wipe the money off
        // a Job whose every draw was priced, at close-out, which is when returns get posted.
        hasUncostedDraw: sql<boolean>`coalesce(bool_or(${stockMovements.unitCost} is null
          and ${stockMovements.movementType} = ${CHECKOUT}), false)`,
        partId: stockMovements.partId,
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
      // Null is reserved for a cost we cannot know; a Part with no draws at all cost this Job zero.
      actualCost: draws?.hasUncostedDraw ? null : (draws?.costedValue ?? 0),
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
    offCfoActualCost: sumActualCosts(items.filter(isOffCfo)),
    totalActualCost: sumActualCosts(items),
  });
}

/** Σ, but a single unpriced Part makes the whole total unpriced rather than quietly smaller. */
function sumActualCosts(items: ReadonlyArray<{ actualCost: number | null }>): number | null {
  return items.some((item) => item.actualCost === null) ? null : sumBy(items, (item) => item.actualCost ?? 0);
}
