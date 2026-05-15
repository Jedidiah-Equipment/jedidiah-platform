import type { JobSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon, BriefcaseBusinessIcon } from 'lucide-react';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatDate } from '@/utils/date.js';

export const JobsPage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions({}));
  const jobs = jobsQuery.data?.jobs ?? [];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1">
            <CardDescription>Production</CardDescription>
            <CardTitle>Jobs</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          {jobsQuery.isLoading ? <JobListSkeleton /> : null}
          {jobsQuery.error ? <p className="text-sm text-destructive">{jobsQuery.error.message}</p> : null}
          {!jobsQuery.isLoading && jobs.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              No jobs found.
            </div>
          ) : null}
          {jobs.length > 0 ? (
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-sm font-medium">
                <span>Job</span>
                <span className="hidden sm:block">Created</span>
              </div>
              <div className="divide-y">
                {jobs.map((job) => (
                  <JobListRow
                    job={job}
                    key={job.id}
                    onOpen={() => navigate({ to: '/jobs/$id', params: { id: job.id } })}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

const JobListRow: React.FC<{ job: JobSummary; onOpen: () => void }> = ({ job, onOpen }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
        <BriefcaseBusinessIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{job.productName}</span>
          <Badge variant="outline">{job.lifecycleStatus}</Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {job.productModelCode} · {job.id}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:block">{formatDate(job.createdAt)}</span>
      <Button aria-label={`Open job ${job.id}`} onClick={onOpen} size="icon-sm" variant="outline">
        <ArrowRightIcon />
      </Button>
    </div>
  </div>
);

const JobListSkeleton: React.FC = () => (
  <div className="flex flex-col gap-2">
    <Skeleton className="h-14" />
    <Skeleton className="h-14" />
    <Skeleton className="h-14" />
  </div>
);
