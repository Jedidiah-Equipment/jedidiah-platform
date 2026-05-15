import type { JobStageName, JobStageRollup, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, LockIcon } from 'lucide-react';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatDate } from '@/utils/date.js';

type JobDetailPageProps = {
  jobId: UUID;
};

const stageLabels = {
  procurement: 'Procurement',
  fabrication: 'Fabrication',
  paint: 'Paint',
  assembly: 'Assembly',
  dispatch: 'Dispatch',
} as const satisfies Record<JobStageName, string>;

export const JobDetailPage: React.FC<JobDetailPageProps> = ({ jobId }) => {
  const trpc = useTRPC();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const job = jobQuery.data;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div>
        <Button render={<Link to="/jobs" />} variant="ghost">
          <ArrowLeftIcon data-icon="inline-start" />
          Jobs
        </Button>
      </div>
      <Card>
        <CardHeader>
          {job ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <CardDescription>{job.productModelCode}</CardDescription>
                <CardTitle>{job.productName}</CardTitle>
              </div>
              <Badge variant="outline">{job.lifecycleStatus}</Badge>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-64" />
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          {jobQuery.error ? <p className="text-sm text-destructive">{jobQuery.error.message}</p> : null}
          {job ? (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <JobFact label="Job ID" value={job.id} />
                <JobFact label="Created" value={formatDate(job.createdAt)} />
                <JobFact label="Updated" value={formatDate(job.updatedAt)} />
              </div>
              <div className="grid gap-3 lg:grid-cols-5">
                {job.stages.map((stage) => (
                  <StagePanel key={`${stage.sequence}-${stage.stage}`} stage={stage} />
                ))}
              </div>
            </>
          ) : null}
          {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
        </CardContent>
      </Card>
    </div>
  );
};

const JobFact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 rounded-md border bg-muted/20 p-3">
    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
    <div className="truncate font-mono text-sm">{value}</div>
  </div>
);

const StagePanel: React.FC<{ stage: JobStageRollup }> = ({ stage }) => (
  <div className="min-h-36 rounded-md border bg-background p-3">
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-xs font-medium uppercase text-muted-foreground">Stage {stage.sequence}</div>
        <div className="font-medium">{stageLabels[stage.stage]}</div>
      </div>
      {stage.access === 'locked' ? (
        <Badge variant="outline">
          <LockIcon data-icon="inline-start" />
          Locked
        </Badge>
      ) : (
        <Badge variant="secondary">{stage.status}</Badge>
      )}
    </div>
    {stage.access === 'visible' ? (
      <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
        <div>Started: {formatDate(stage.startedAt, 'short', 'Not started')}</div>
        <div>Completed: {formatDate(stage.completedAt, 'short', 'Not completed')}</div>
      </div>
    ) : (
      <div className="mt-4 text-sm text-muted-foreground">Stage details hidden.</div>
    )}
  </div>
);
