import { countPhrase, openJobQueues, orderJobsNeedingALook } from '@pkg/domain/contracting';
import type { JobSummary } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/pages/dashboard/dashboard-refresh.js';
import { JobAttentionBadge } from '@/contracting/pages/jobs/JobAttentionBadge.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardListBlock, dashboardRowClassName, dashboardRowLinkClassName } from './DashboardListBlock.js';

export function JobsNeedingALookWidget() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingJobs.jobs.list.queryOptions({ queues: [...openJobQueues], needsALook: true, limit: 0 }),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    select: (result) => orderJobsNeedingALook(result.items),
  });
  return (
    <DashboardListBlock
      rows={query.data}
      error={query.error}
      errorMessage="Unable to load Jobs."
      count={(total) => countPhrase(total, 'Job', 'Jobs')}
      viewAll={
        <PrimaryLink to="/contracting/jobs" search={{ needsALook: true }}>
          View all
        </PrimaryLink>
      }
      empty="No Job needs a look."
      rowKey={(job) => job.id}
      renderRow={(job) => <JobNeedingALookRow job={job} />}
    />
  );
}

function JobNeedingALookRow({ job }: { job: JobSummary }) {
  return (
    <div className={dashboardRowClassName}>
      <span className="min-w-0">
        <Link className={dashboardRowLinkClassName} to="/contracting/jobs/$code" params={{ code: job.jobNumber }}>
          <span className="font-mono font-semibold">{job.jobNumber}</span> {job.customerName} · {job.farmName}
        </Link>
        <span className="block truncate text-muted-foreground text-xs">
          {job.workTypeName} · {job.foremanName ?? 'No Foreman'}
        </span>
      </span>
      <JobAttentionBadge attention={job.assignmentAttention} />
    </div>
  );
}
