import { jobLifecycleStatusLabels } from '@pkg/domain';
import type { JobCode, JobListInput, JobSummary, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';

import { DateDisplay } from '@/components/DateDisplay.js';
import { ErrorMessage } from '@/components/ErrorMessage.js';
import { PrimaryLink } from '@/components/PrimaryLink.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobLifecycleStatusBadge } from './JobLifecycleStatusBadge.js';
import { JobStageChips } from './JobStageChips.js';

type JobCodeDisplayProps = {
  canOpenJob: boolean;
  jobCode: JobCode | null;
  jobId: UUID | null;
  withHoverCard?: boolean;
};

export const JobCodeDisplay: React.FC<JobCodeDisplayProps> = ({
  canOpenJob,
  jobCode,
  jobId,
  withHoverCard = false,
}) => {
  if (!jobCode) {
    return <span className="text-muted-foreground">None</span>;
  }

  const codeDisplay =
    canOpenJob && jobId ? <JobCodeLink jobCode={jobCode} jobId={jobId} /> : <JobCodeText jobCode={jobCode} />;

  if (!withHoverCard || !canOpenJob || !jobId) {
    return codeDisplay;
  }

  return (
    <JobCodeHoverCard jobCode={jobCode} jobId={jobId}>
      {codeDisplay}
    </JobCodeHoverCard>
  );
};

const JobCodeLink: React.FC<{ jobCode: JobCode; jobId: UUID }> = ({ jobCode, jobId }) => (
  <PrimaryLink params={{ id: jobId }} to="/jobs/$id">
    {jobCode}
  </PrimaryLink>
);

const JobCodeText: React.FC<{ jobCode: JobCode }> = ({ jobCode }) => <span className="font-medium">{jobCode}</span>;

const JobCodeHoverCard: React.FC<{
  children: React.ReactElement;
  jobCode: JobCode;
  jobId: UUID;
}> = ({ children, jobCode, jobId }) => {
  const trpc = useTRPC();
  const [isOpen, setIsOpen] = useState(false);
  const input = useMemo(
    () =>
      ({
        filters: {
          jobId,
          lifecycleStatuses: [],
        },
        page: 1,
        pageSize: 1,
        search: '',
        sortBy: 'createdAt',
        sortDirection: 'asc',
      }) satisfies JobListInput,
    [jobId],
  );
  const jobQuery = useQuery(
    trpc.jobs.list.queryOptions(input, {
      enabled: isOpen,
    }),
  );
  const job = jobQuery.data?.items[0] ?? null;

  return (
    <HoverCard onOpenChange={setIsOpen} open={isOpen}>
      <HoverCardTrigger render={children} />
      <HoverCardContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{jobCode}</div>
              <div className="text-xs text-muted-foreground">Job state</div>
            </div>
            {job ? <JobLifecycleStatusBadge className="shrink-0" status={job.lifecycleStatus} /> : null}
          </div>
          <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job preview." />
          {jobQuery.isFetching ? <JobPreviewSkeleton /> : null}
          {!jobQuery.isFetching && job ? <JobPreview job={job} /> : null}
          {!jobQuery.isFetching && !job && !jobQuery.error ? (
            <div className="text-sm text-muted-foreground">No job preview found.</div>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const JobPreview: React.FC<{ job: JobSummary }> = ({ job }) => (
  <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 gap-2 text-sm">
      <JobPreviewFact label="Due" value={<DateDisplay date={job.dueDate} emptyValue="No date" />} />
      <JobPreviewFact label="Status" value={jobLifecycleStatusLabels[job.lifecycleStatus]} />
      <JobPreviewFact label="Product" value={`${job.productName} (${job.productModelCode})`} />
      <JobPreviewFact label="Quote" value={job.quoteCode ?? 'None'} />
    </div>
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">Departments</div>
      <JobStageChips stages={job.stages} />
    </div>
  </div>
);

const JobPreviewFact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="min-w-0 rounded-md border p-2">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 truncate">{value}</div>
  </div>
);

const JobPreviewSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 gap-2">
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
      <Skeleton className="h-14" />
    </div>
    <Skeleton className="h-8" />
  </div>
);
