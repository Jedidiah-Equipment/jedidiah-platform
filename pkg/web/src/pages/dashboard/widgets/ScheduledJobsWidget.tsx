import { formatDate, getJobDisplayName, listScheduledJobs, type ScheduledJob } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema';
import type React from 'react';

import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { JobCodeDisplay } from '@/pages/jobs/components/JobCodeDisplay.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

const SCHEDULED_JOBS_MAX_ROWS = 8;
const SCHEDULED_JOBS_SKELETON_ROWS = ['first', 'second', 'third'] as const;

export const ScheduledJobsWidget: React.FC = () => {
  const bays = useShopFloorBays();
  const jobAccess = useCan('job:read');

  if (bays.status === 'error') {
    return <DashboardWidgetError error={bays.error} fallbackMessage="Unable to load scheduled jobs." />;
  }

  if (bays.status === 'pending') {
    return <ScheduledJobsWidgetSkeleton />;
  }

  const scheduledJobs = listScheduledJobs({ bays: bays.enabledBays });

  if (scheduledJobs.length === 0) {
    return <DashboardWidgetEmpty>No scheduled jobs.</DashboardWidgetEmpty>;
  }

  const visibleJobs = scheduledJobs.slice(0, SCHEDULED_JOBS_MAX_ROWS);
  const hiddenJobCount = scheduledJobs.length - visibleJobs.length;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <ScrollArea className="max-h-64">
        <ul className="flex flex-col divide-y pr-3">
          {visibleJobs.map((scheduledJob) => (
            <li key={scheduledJob.jobId}>
              <ScheduledJobRow
                canOpenJobs={jobAccess.can}
                job={bays.jobsById.get(scheduledJob.jobId) ?? null}
                scheduledJob={scheduledJob}
              />
            </li>
          ))}
        </ul>
      </ScrollArea>
      {hiddenJobCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Showing first {visibleJobs.length} of {scheduledJobs.length} scheduled jobs.
        </p>
      ) : null}
    </div>
  );
};

function ScheduledJobRow({
  canOpenJobs,
  job,
  scheduledJob,
}: {
  canOpenJobs: boolean;
  job: JobSummary | null;
  scheduledJob: ScheduledJob;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 py-2 text-sm first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block truncate">
          <JobCodeDisplay canOpenJob={canOpenJobs} jobCode={job?.code ?? null} jobId={scheduledJob.jobId} />
        </span>
        {job ? <span className="block truncate text-muted-foreground">{getJobDisplayName(job)}</span> : null}
        <span className="block truncate text-muted-foreground text-xs">{scheduledJob.bayName}</span>
      </span>
      <span className="font-medium tabular-nums">{formatDate(scheduledJob.startDate, 'MMM d')}</span>
    </div>
  );
}

function ScheduledJobsWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {SCHEDULED_JOBS_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[1fr_auto] items-start gap-3">
          <span className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-32 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </span>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
