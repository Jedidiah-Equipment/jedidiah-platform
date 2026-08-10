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
  const estimatedCostFloor = snapshotRow?.payload.totalCostFloor ?? null;

  return JobCostComparisonSchema.parse({
    actualCost: variance.totalActualCost,
    estimatedCostFloor,
    estimateVariance:
      estimatedCostFloor === null || variance.totalActualCost === null
        ? null
        : variance.totalActualCost - estimatedCostFloor,
    snapshot: snapshotRow ? { createdAt: snapshotRow.createdAt.toISOString(), estimate: snapshotRow.payload } : null,
  });
}
