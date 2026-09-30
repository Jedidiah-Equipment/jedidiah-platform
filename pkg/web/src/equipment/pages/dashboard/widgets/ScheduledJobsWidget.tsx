import { formatDate } from '@pkg/domain';
import {
  getBayDisplayText,
  getJobDisplayName,
  getJobOfferingKind,
  listScheduledJobs,
  type ScheduledJob,
} from '@pkg/domain/equipment';
import type { JobSummary } from '@pkg/schema/equipment';
import type React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { OfferingThumbnail } from '@/equipment/components/thumbnail/OfferingThumbnail.js';
import { JobCodeDisplay } from '@/equipment/pages/jobs/components/JobCodeDisplay.js';
import { useCan } from '@/hooks/use-access.js';

import { DashboardList, DashboardListItem } from '../DashboardList.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

const SCHEDULED_JOBS_MAX_ROWS = 10;
const SCHEDULED_JOBS_SKELETON_ROWS = ['first', 'second', 'third'] as const;

export const ScheduledJobsWidget: React.FC = () => {
  const bays = useShopFloorBays();
  const jobAccess = useCan('equipment_job:read');

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
        <DashboardList className="pr-3">
          {visibleJobs.map((scheduledJob) => (
            <DashboardListItem key={scheduledJob.jobId}>
              <ScheduledJobRow
                canOpenJobs={jobAccess.can}
                job={bays.jobsById.get(scheduledJob.jobId) ?? null}
                scheduledJob={scheduledJob}
              />
            </DashboardListItem>
          ))}
        </DashboardList>
      </ScrollArea>
      {hiddenJobCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Showing first {visibleJobs.length} of {scheduledJobs.length} scheduled jobs.
        </p>
      ) : null}
    </div>
  );
};

export function ScheduledJobRow({
  canOpenJobs,
  job,
  scheduledJob,
}: {
  canOpenJobs: boolean;
  job: JobSummary | null;
  scheduledJob: ScheduledJob;
}) {
  const display = getBayDisplayText(scheduledJob);
  const where = `${display.primaryText} - ${display.secondaryText}`;
  const jobDisplayName = job ? getJobDisplayName(job) : null;
  const subtitle = scheduledJobSubtitle(where, jobDisplayName);

  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <OfferingThumbnail
          kind={job ? getJobOfferingKind(job) : null}
          label={jobDisplayName ?? job?.code ?? scheduledJob.jobId}
          preview={false}
          thumbnailDataUrl={job?.productThumbnailDataUrl}
        />
        <span className="min-w-0">
          <span className="block truncate">
            <JobCodeDisplay canOpenJob={canOpenJobs} jobCode={job?.code ?? null} jobId={scheduledJob.jobId} />
          </span>
          {subtitle ? <span className="block truncate text-muted-foreground">{subtitle}</span> : null}
        </span>
      </span>
      <span className="font-medium tabular-nums">{formatDate(scheduledJob.startDate, 'day')}</span>
    </div>
  );
}

/** The paired Bay identity followed by the Product or custom work title. */
export function scheduledJobSubtitle(where: string | null, jobDisplayName: string | null): string | null {
  if (!jobDisplayName) return where;
  if (!where) return jobDisplayName;

  return `${where} - ${jobDisplayName}`;
}

function ScheduledJobsWidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {SCHEDULED_JOBS_SKELETON_ROWS.map((row) => (
        <div key={row} className="grid grid-cols-[1fr_auto] items-start gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </span>
          </span>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
