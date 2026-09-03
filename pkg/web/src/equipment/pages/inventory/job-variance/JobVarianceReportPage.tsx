import type { UUID } from '@pkg/schema';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { describeVarianceJob, JobVarianceReport } from './components/JobVarianceReport.js';
import { useJobVariance } from './use-job-variance.js';

/**
 * One Job's material variance as an inventory screen (spec §3, §12). It exists beside the Job
 * sheet's own tab because the people who read this report at close-out are exactly the ones the Job
 * surfaces are closed to: `stores` holds `inventory:read` and no `job:read`, and this read carries
 * the Job facts it needs itself rather than asking a Job procedure for them.
 */
export function JobVarianceReportPage({ jobId }: { jobId: UUID }) {
  const { query, showCosts } = useJobVariance(jobId);

  if (query.isPending) {
    return (
      <PageLayout title="Material variance">
        <Skeleton className="h-40 w-full" />
      </PageLayout>
    );
  }

  if (query.error) {
    return (
      <PageLayout title="Material variance">
        <p className="text-destructive text-sm">Unable to load this Job’s variance.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      description={describeVarianceJob(query.data.job)}
      title={`Material variance · ${query.data.job.displayName}`}
    >
      <JobVarianceReport report={query.data} showCosts={showCosts} />
    </PageLayout>
  );
}
