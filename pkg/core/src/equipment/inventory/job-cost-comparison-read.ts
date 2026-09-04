import type { Db } from '@pkg/db';
import { jobEstimateSnapshots } from '@pkg/db/equipment';
import type { UUID } from '@pkg/schema';
import type { JobCostComparison } from '@pkg/schema/equipment';
import { JobCostComparison as JobCostComparisonSchema } from '@pkg/schema/equipment';
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
