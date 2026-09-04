import type { UUID } from '@pkg/schema';

import { Skeleton } from '@/components/ui/skeleton.js';
import { useJobVariance } from '../use-job-variance.js';
import { JobCostComparisonSummary } from './JobCostComparisonSummary.js';
import { describeVarianceJob, JobVarianceReport } from './JobVarianceReport.js';

/**
 * The Job's material variance beside its stock tab (spec §3, §12). The same report the inventory
 * screen serves — read here by whoever is already looking at the Job, there by the storeman closing
 * it out, who holds `equipment_inventory:read` without `equipment_job:read` and so never reaches this sheet.
 */
export function JobVarianceTab({ jobId }: { jobId: UUID }) {
  const { query, showCosts } = useJobVariance(jobId);

  if (query.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (query.error) {
    return <p className="text-destructive text-sm">Unable to load Job variance.</p>;
  }

  return (
    <div className="grid gap-3">
      {/* Where the Job's stock life stands, the same line the inventory screen leads with: a variance
          read after close-out means something different from one read mid-build. */}
      <p className="text-muted-foreground text-sm">{describeVarianceJob(query.data.job)}</p>
      {showCosts ? <JobCostComparisonSummary jobId={jobId} /> : null}
      <JobVarianceReport report={query.data} showCosts={showCosts} />
    </div>
  );
}
