import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { describeVarianceJob, JobVarianceReport } from '../../jobs/components/JobVarianceReport.js';

/**
 * One Job's material variance as an inventory screen (spec §3, §12). It exists beside the Job
 * sheet's own tab because the people who read this report at close-out are exactly the ones the Job
 * surfaces are closed to: `stores` holds `inventory:read` and no `job:read`, and this read carries
 * the Job facts it needs itself rather than asking a Job procedure for them.
 */
export function JobVarianceReportPage({ jobId }: { jobId: UUID }) {
  const trpc = useTRPC();
  const showCosts = useCan('inventory_cost:read').can;
  const varianceQuery = useQuery(trpc.inventory.jobVariance.queryOptions({ jobId }));

  if (varianceQuery.isPending) {
    return (
      <PageLayout size="lg" title="Material variance">
        <Skeleton className="h-40 w-full" />
      </PageLayout>
    );
  }

  if (varianceQuery.error) {
    return (
      <PageLayout size="lg" title="Material variance">
        <p className="text-destructive text-sm">Unable to load this Job’s variance.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      description={describeVarianceJob(varianceQuery.data.job)}
      size="lg"
      title={`Material variance · ${varianceQuery.data.job.displayName}`}
    >
      <JobVarianceReport report={varianceQuery.data} showCosts={showCosts} />
    </PageLayout>
  );
}
