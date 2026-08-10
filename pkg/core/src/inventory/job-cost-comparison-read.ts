import { type Db, jobEstimateSnapshots } from '@pkg/db';
import type { JobCostComparison, UUID } from '@pkg/schema';
import { JobCostComparison as JobCostComparisonSchema } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { getJobMaterialVariance } from './job-variance-read.js';

export async function getJobCostComparison({ db, jobId }: { db: Db; jobId: UUID }): Promise<JobCostComparison> {
  const [variance, snapshotRow] = await Promise.all([
    getJobMaterialVariance({ db, jobId }),
    db
      .select({ createdAt: jobEstimateSnapshots.createdAt, payload: jobEstimateSnapshots.payload })
      .from(jobEstimateSnapshots)
      .where(eq(jobEstimateSnapshots.jobId, jobId))
      .limit(1)
      .then(([row]) => row ?? null),
  ]);
  const estimatedPartsCostFloor = snapshotRow?.payload.partsCostFloor ?? null;

  return JobCostComparisonSchema.parse({
    actualCost: variance.totalActualCost,
    estimatedPartsCostFloor,
    partsCostVariance:
      estimatedPartsCostFloor === null || variance.totalActualCost === null
        ? null
        : variance.totalActualCost - estimatedPartsCostFloor,
    snapshot: snapshotRow ? { createdAt: snapshotRow.createdAt.toISOString(), estimate: snapshotRow.payload } : null,
  });
}
