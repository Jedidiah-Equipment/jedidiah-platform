import { jobStageStatusLabels } from '@pkg/domain';
import {
  JOB_STAGE_STATUSES,
  type JobStageName,
  type JobStageRollup,
  type JobStageStatus,
  JobStageStatusInput,
  type UUID,
} from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, CheckCircleIcon, CircleIcon, LockIcon, PlayIcon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { formatDate } from '@/utils/date.js';
import { JobStageStatusBadge } from './components/JobStageStatusBadge.js';
import { getJobStageStatusColorClassNames } from './components/job-stage-status-color.js';

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
  const queryClient = useQueryClient();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const job = jobQuery.data;
  const refreshJob = async () => {
    await queryClient.invalidateQueries(trpc.jobs.get.queryFilter({ id: jobId }));
  };
  const startStageMutation = useMutation(
    trpc.jobs.startStage.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Stage started');
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const setStageStatusMutation = useMutation(
    trpc.jobs.setStageStatus.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Stage status updated');
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const completeStageMutation = useMutation(
    trpc.jobs.completeStage.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Stage completed');
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const isTransitionPending =
    startStageMutation.isPending || setStageStatusMutation.isPending || completeStageMutation.isPending;

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
                  <StagePanel
                    isPending={isTransitionPending}
                    jobId={job.id}
                    key={`${stage.sequence}-${stage.stage}`}
                    onComplete={(input) => completeStageMutation.mutate(input)}
                    onSetStatus={(input) => setStageStatusMutation.mutate(input)}
                    onStart={(input) => startStageMutation.mutate(input)}
                    stage={stage}
                  />
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

type StagePanelProps = {
  isPending: boolean;
  jobId: UUID;
  onComplete: (input: { id: UUID; stage: JobStageName }) => void;
  onSetStatus: (input: JobStageStatusInput) => void;
  onStart: (input: { id: UUID; stage: JobStageName }) => void;
  stage: JobStageRollup;
};

const StagePanel: React.FC<StagePanelProps> = ({ isPending, jobId, onComplete, onSetStatus, onStart, stage }) => {
  const [status, setStatus] = React.useState<JobStageStatus>(stage.access === 'visible' ? stage.status : 'pending');
  const startAvailability = stage.access === 'visible' ? stage.transitionAvailability?.start : undefined;
  const statusAvailability = stage.access === 'visible' ? stage.transitionAvailability?.['set-status'] : undefined;
  const completeAvailability = stage.access === 'visible' ? stage.transitionAvailability?.complete : undefined;
  const isActiveStage = stage.access === 'visible' && Boolean(stage.startedAt) && !stage.completedAt;
  const isStartDisabled = isPending || !startAvailability?.allowed;
  const isStatusDisabled = isPending || !statusAvailability?.allowed;
  const isCompleteDisabled = isPending || !completeAvailability?.allowed;

  React.useEffect(() => {
    if (stage.access === 'visible') {
      setStatus(stage.status);
    }
  }, [stage]);

  return (
    <div
      className={cn(
        'min-h-36 rounded-md border bg-background p-3',
        isActiveStage &&
          'border-emerald-500/70 bg-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.25)] dark:bg-emerald-500/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className={cn(
              'text-xs font-medium uppercase text-muted-foreground',
              isActiveStage && 'text-emerald-700 dark:text-emerald-300',
            )}
          >
            Stage {stage.sequence}
          </div>
          <div className="font-medium">{stageLabels[stage.stage]}</div>
        </div>
        {stage.access === 'locked' ? (
          <Badge variant="outline">
            <LockIcon data-icon="inline-start" />
            Locked
          </Badge>
        ) : (
          <JobStageStatusBadge stage={stage.stage} status={stage.status} />
        )}
      </div>
      {stage.access === 'visible' ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <div>Started: {formatDate(stage.startedAt, 'short', 'Not started')}</div>
            <div>Completed: {formatDate(stage.completedAt, 'short', 'Not completed')}</div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              disabled={isStartDisabled}
              onClick={() => onStart({ id: jobId, stage: stage.stage })}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlayIcon data-icon="inline-start" />
              Start
            </Button>
            <div className="flex gap-2">
              <Select
                disabled={isStatusDisabled}
                onValueChange={(value) => {
                  if (!value || value === status) return;

                  const nextStatus = value as JobStageStatus;
                  setStatus(nextStatus);
                  onSetStatus(JobStageStatusInput.parse({ id: jobId, stage: stage.stage, status: nextStatus }));
                }}
                value={status}
              >
                <SelectTrigger aria-label={`${stageLabels[stage.stage]} status`} className="min-w-0 flex-1">
                  <JobStageStatusSelectValue stage={stage.stage} status={status} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {JOB_STAGE_STATUSES[stage.stage].map((option) => (
                      <SelectItem
                        key={option}
                        leading={<JobStageStatusIcon stage={stage.stage} status={option} />}
                        value={option}
                      >
                        {jobStageStatusLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={isCompleteDisabled}
              onClick={() => onComplete({ id: jobId, stage: stage.stage })}
              size="sm"
              type="button"
              variant="outline"
            >
              <CheckCircleIcon data-icon="inline-start" />
              Complete
            </Button>
            <StageControlReason
              reason={startAvailability?.reason ?? statusAvailability?.reason ?? completeAvailability?.reason}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">Stage details hidden.</div>
      )}
    </div>
  );
};

const StageControlReason: React.FC<{ reason: string | null | undefined }> = ({ reason }) =>
  reason ? <div className="text-xs text-muted-foreground">{reason}</div> : null;

const JobStageStatusSelectValue: React.FC<{ stage: JobStageName; status: JobStageStatus }> = ({ stage, status }) => (
  <span className="flex min-w-0 flex-1 items-center gap-2 text-left" data-slot="select-value">
    <JobStageStatusIcon stage={stage} status={status} />
    <span className="truncate">{jobStageStatusLabels[status]}</span>
  </span>
);

const JobStageStatusIcon: React.FC<{ stage: JobStageName; status: JobStageStatus }> = ({ stage, status }) => {
  const color = getJobStageStatusColorClassNames(stage, status);

  return (
    <span className="inline-flex size-3 shrink-0 items-center justify-center">
      <CircleIcon aria-hidden="true" className={cn('size-3', color.icon)} strokeWidth={0} />
    </span>
  );
};
