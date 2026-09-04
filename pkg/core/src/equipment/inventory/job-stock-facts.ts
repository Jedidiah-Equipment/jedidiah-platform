import { type Db, jobCfoAssemblies, jobCfoParts, jobs, products, productUnits, quotes, stockMovements } from '@pkg/db';
import type { JobStockJob, UUID } from '@pkg/schema';
import { JobStockJob as JobStockJobSchema } from '@pkg/schema';
import { eq, sql } from 'drizzle-orm';

import { jobDisplayNameOf, jobDisplaySelection } from '../jobs/job-display.js';
import { JobNotFoundError } from '../jobs/job-errors.js';
import { getJobCloseOutAt } from './close-out-service.js';

/**
 * The Job facts every Job-scoped inventory read carries, close-out included. They ride the stock
 * reads rather than a Job read because `stores` works a Job's stock without holding `equipment_job:read`, and
 * they are loaded here rather than per read so the stock tab and the variance report cannot come to
 * different conclusions about whether a Job's stock life has ended.
 */
export async function loadJobStockJob({ db, jobId }: { db: Db; jobId: UUID }): Promise<JobStockJob> {
  const [job] = await db
    .select({
      ...jobDisplaySelection,
      cancelledAt: jobs.cancelledAt,
      completedOn: jobs.completedOn,
      id: jobs.id,
    })
    .from(jobs)
    .leftJoin(productUnits, eq(productUnits.id, jobs.productUnitId))
    .leftJoin(products, eq(products.id, productUnits.productId))
    .leftJoin(quotes, eq(quotes.id, jobs.quoteId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) throw new JobNotFoundError(jobId);

  return JobStockJobSchema.parse({
    cancelledAt: job.cancelledAt,
    closedOutAt: await getJobCloseOutAt({ db, jobId }),
    code: job.code,
    completedOn: job.completedOn,
    displayName: jobDisplayNameOf(job),
    id: job.id,
  });
}

/**
 * What a Job's draws are worth, in SQL, at the price each was stamped with — never re-priced at
 * today's average, so a receipt landing after the draw cannot move a figure the plant has read.
 *
 * Draws leave stock, so their deltas are negative and a return's is positive: negating the sums
 * turns the ledger's signs into what the Job is holding, in quantity and in money. Only costed rows
 * are summed and the total starts at zero rather than null, so what comes back is always "the value
 * we can account for" — never a null standing in for both "nothing was drawn" and "something was
 * drawn we cannot price".
 *
 * Shared by the per-Part variance report and the per-Job cost read, which group the same rows
 * differently and must never come to different conclusions about what a draw was worth.
 */
export const drawnCostedValueExpression = sql<number>`(-coalesce(sum(${stockMovements.delta} * ${stockMovements.unitCost})
  filter (where ${stockMovements.unitCost} is not null), 0))::double precision`;

/**
 * How much unpriced material a Job is *still holding* — the one fact that makes its cost unknowable
 * rather than merely small. Netted rather than counted, because what matters is what is outstanding:
 * an unpriced draw handed straight back leaves nothing to price, and a Part whose every draw was
 * priced must not be unpriced by it.
 *
 * The sign does the work that naming a movement type used to. A return is stamped null whenever its
 * bucket's pool has nothing outstanding left to reverse — an offcut handed back in a length the Job
 * never drew, a piece returned past what it still held — and each of those is a positive delta, so
 * it can only ever reduce this figure, never raise it.
 */
export const uncostedDrawnQuantityExpression = sql<number>`(-coalesce(sum(${stockMovements.delta})
  filter (where ${stockMovements.unitCost} is null), 0))::double precision`;

/**
 * What the Job's CFO demands per Part, summed across its assemblies — a Part appearing on a standard
 * and an optional assembly is one demand for that Part, not two rows. Shared by the stock tab and
 * the variance report so the two can never disagree about what was planned.
 */
export async function loadCfoQuantitiesByPart({ db, jobId }: { db: Db; jobId: UUID }): Promise<Map<string, number>> {
  const rows = await db
    .select({
      partId: jobCfoParts.partId,
      quantity: sql<number>`sum(${jobCfoParts.quantity})::double precision`,
    })
    .from(jobCfoAssemblies)
    .innerJoin(jobCfoParts, eq(jobCfoParts.cfoAssemblyId, jobCfoAssemblies.id))
    .where(eq(jobCfoAssemblies.jobId, jobId))
    .groupBy(jobCfoParts.partId);

  return new Map(rows.map((row) => [row.partId, row.quantity]));
}
