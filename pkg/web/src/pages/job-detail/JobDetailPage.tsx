import { hasPermission, jobLifecycleStatusLabels } from '@pkg/domain';
import type { JobDetail, JobStageStatusInput, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/ErrorMessage.js';
import { PrimaryLink } from '@/components/PrimaryLink.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatDate } from '@/utils/date.js';
import { JobLifecycleStatusBadge } from '../jobs/components/JobLifecycleStatusBadge.js';
import { JobFact } from './components/JobFact.js';
import { JobTransitionConfirmationDialog } from './components/JobTransitionConfirmationDialog.js';
import { LifecycleControls } from './components/LifecycleControls.js';
import { StagePanel } from './components/StagePanel.js';
import { WorkflowHistory } from './components/WorkflowHistory.js';
import { stageLabels } from './constants.js';
import type { JobStageTransitionInput, JobTransitionConfirmation } from './types.js';

type JobDetailPageProps = {
  jobId: UUID;
};

export const JobDetailPage: React.FC<JobDetailPageProps> = ({ jobId }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const job = jobQuery.data;
  const [confirmation, setConfirmation] = React.useState<JobTransitionConfirmation | null>(null);
  const refreshJob = async () => {
    await queryClient.invalidateQueries(trpc.jobs.get.queryFilter({ id: jobId }));
  };
  const startStageMutation = useMutation(
    trpc.jobs.startStage.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Stage started');
      },
      onError: (error) => showMutationError(error, 'Unable to start job stage.'),
    }),
  );
  const setStageStatusMutation = useMutation(
    trpc.jobs.setStageStatus.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Stage status updated');
      },
      onError: (error) => showMutationError(error, 'Unable to update job stage.'),
    }),
  );
  const completeStageMutation = useMutation(
    trpc.jobs.completeStage.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Stage completed');
      },
      onError: (error) => showMutationError(error, 'Unable to complete job stage.'),
    }),
  );
  const pauseJobMutation = useMutation(
    trpc.jobs.pause.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Job paused');
      },
      onError: (error) => showMutationError(error, 'Unable to pause job.'),
    }),
  );
  const resumeJobMutation = useMutation(
    trpc.jobs.resume.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Job resumed');
      },
      onError: (error) => showMutationError(error, 'Unable to resume job.'),
    }),
  );
  const cancelJobMutation = useMutation(
    trpc.jobs.cancel.mutationOptions({
      onSuccess: async () => {
        await refreshJob();
        toast.success('Job cancelled');
      },
      onError: (error) => showMutationError(error, 'Unable to cancel job.'),
    }),
  );
  const isTransitionPending =
    startStageMutation.isPending ||
    setStageStatusMutation.isPending ||
    completeStageMutation.isPending ||
    pauseJobMutation.isPending ||
    resumeJobMutation.isPending ||
    cancelJobMutation.isPending;
  const canUpdateJob = hasPermission(accessQuery.data, 'job:update');
  const canOpenQuotes =
    hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');
  const confirmPauseJob = (id: UUID) => {
    setConfirmation({
      body: [
        'This will pause the Job for everyone. Department managers will not be able to start work, mark their part as complete, or update their department status until a supervisor resumes it.',
        'Nothing already recorded on the Job will change. People can still view the Job and its history.',
      ],
      confirmLabel: 'Pause job',
      confirmVariant: 'outline',
      onConfirm: () => pauseJobMutation.mutate({ id }),
      title: 'Pause job?',
    });
  };
  const confirmCancelJob = (id: UUID) => {
    setConfirmation({
      body: [
        'This will cancel the Job for everyone. No department will be able to pick it up again or continue work afterward.',
        'The Job will stay visible, along with its history. Each department will still show where the work stopped.',
      ],
      confirmLabel: 'Cancel job',
      confirmVariant: 'destructive',
      onConfirm: () => cancelJobMutation.mutate({ id }),
      title: 'Cancel job?',
    });
  };
  const confirmCompleteStageTransition = (input: JobStageTransitionInput, onConfirm: () => void) => {
    const isDispatchStage = input.stage === 'dispatch';

    setConfirmation({
      body: isDispatchStage
        ? [
            'This will complete Dispatch and mark the whole Job as complete.',
            'After this, no department can make more updates. The Job cannot be paused, resumed, or cancelled.',
            'The existing Job history will stay as it is.',
          ]
        : [
            `This will mark ${stageLabels[input.stage]}'s part of the Job as complete.`,
            'The next department will be able to start handling the Job.',
            `${stageLabels[input.stage]} will still be able to update their status later if they need to show late changes, but their part will stay completed.`,
          ],
      confirmLabel: isDispatchStage ? 'Complete job' : `Complete ${stageLabels[input.stage]}`,
      confirmVariant: 'default',
      onConfirm,
      title: isDispatchStage ? 'Complete Dispatch and finish job?' : `Complete ${stageLabels[input.stage]}?`,
    });
  };
  const confirmCompleteStage = (input: JobStageTransitionInput) => {
    confirmCompleteStageTransition(input, () => completeStageMutation.mutate(input));
  };
  const confirmSetCompleteStageStatus = (input: JobStageStatusInput) => {
    confirmCompleteStageTransition(input, () => setStageStatusMutation.mutate(input));
  };

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
              <JobLifecycleStatusBadge status={job.lifecycleStatus} />
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
          <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
          {job ? (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <JobFact label="Job ID" value={job.id} />
                <JobFact label="Created" value={formatDate(job.createdAt)} />
                <JobFact label="Due date" value={formatDate(job.dueDate, 'short', 'No date')} />
                <JobFact label="Updated" value={formatDate(job.updatedAt)} />
                <JobFact
                  label="Quote"
                  value={<JobQuoteLink canOpenQuote={canOpenQuotes} quoteCode={job.quoteCode} quoteId={job.quoteId} />}
                />
              </div>
              {canUpdateJob ? (
                <LifecycleControls
                  isPending={isTransitionPending}
                  lifecycleStatus={job.lifecycleStatus}
                  onCancel={() => confirmCancelJob(job.id)}
                  onPause={() => confirmPauseJob(job.id)}
                  onResume={() => resumeJobMutation.mutate({ id: job.id })}
                />
              ) : null}
              {job.lifecycleStatus !== 'active' ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                  Stage controls are disabled while this job is {jobLifecycleStatusLabels[job.lifecycleStatus]}.
                </div>
              ) : null}
              <div className="grid gap-3 lg:grid-cols-5">
                {job.stages.map((stage) => (
                  <StagePanel
                    isPending={isTransitionPending}
                    jobId={job.id}
                    key={`${stage.sequence}-${stage.stage}`}
                    onComplete={confirmCompleteStage}
                    onSetCompleteStatus={confirmSetCompleteStageStatus}
                    onSetStatus={(input) => setStageStatusMutation.mutate(input)}
                    onStart={(input) => startStageMutation.mutate(input)}
                    stage={stage}
                  />
                ))}
              </div>
              <WorkflowHistory events={job.workflowEvents} />
            </>
          ) : null}
          {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
        </CardContent>
      </Card>
      <JobTransitionConfirmationDialog
        confirmation={confirmation}
        isPending={isTransitionPending}
        onClose={() => setConfirmation(null)}
      />
    </div>
  );
};

const JobQuoteLink: React.FC<{
  canOpenQuote: boolean;
  quoteCode: JobDetail['quoteCode'];
  quoteId: JobDetail['quoteId'];
}> = ({ canOpenQuote, quoteCode, quoteId }) => {
  if (!quoteCode) {
    return <span>Direct job</span>;
  }

  if (canOpenQuote && quoteId) {
    return (
      <PrimaryLink params={{ id: quoteId }} to="/quotes/$id">
        {quoteCode}
      </PrimaryLink>
    );
  }

  return <span>{quoteCode}</span>;
};
