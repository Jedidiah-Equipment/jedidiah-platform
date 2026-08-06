import { type Db, jobCfoAssemblies, jobCfoParts, jobs, products, productUnits, quotes } from '@pkg/db';
import type { JobStockJob, UUID } from '@pkg/schema';
import { JobStockJob as JobStockJobSchema } from '@pkg/schema';
import { eq, sql } from 'drizzle-orm';

import { jobDisplayNameOf, jobDisplaySelection } from '../jobs/job-display.js';
import { JobNotFoundError } from '../jobs/job-errors.js';
import { getJobCloseOutAt } from './close-out-service.js';

/**
 * The Job facts every Job-scoped inventory read carries, close-out included. They ride the stock
 * reads rather than a Job read because `stores` works a Job's stock without holding `job:read`, and
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
