import { FINAL_JOB_STAGE, hasPermission, jobLifecycleStatusLabels } from '@pkg/domain';
import type { JobDetail, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { DetailPageLayout } from '@/components/page-layout/DetailPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
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
  const refreshJobs = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() });
  };
  const getDepartmentLabel = (input: JobStageTransitionInput) => stageLabels[input.stage];
  const startStageMutation = useMutation(
    trpc.jobs.startStage.mutationOptions({
      onSuccess: async (_updatedJob, input) => {
        await refreshJobs();
        toast.success(`${getDepartmentLabel(input)} started`);
      },
      onError: (error) => showMutationError(error, 'Unable to start department work.'),
    }),
  );
  const completeStageMutation = useMutation(
    trpc.jobs.completeStage.mutationOptions({
      onSuccess: async (_updatedJob, input) => {
        await refreshJobs();
        toast.success(`${getDepartmentLabel(input)} completed`);
      },
      onError: (error) => showMutationError(error, 'Unable to complete department work.'),
    }),
  );
  const startStationBookingMutation = useMutation(
    trpc.jobs.startStationBooking.mutationOptions({
      onSuccess: async () => {
        await refreshJobs();
        toast.success('Station booking started');
      },
      onError: (error) => showMutationError(error, 'Unable to start station booking.'),
    }),
  );
  const stopStationBookingMutation = useMutation(
    trpc.jobs.stopStationBooking.mutationOptions({
      onSuccess: async () => {
        await refreshJobs();
        toast.success('Station booking ended');
      },
      onError: (error) => showMutationError(error, 'Unable to end station booking.'),
    }),
  );
  const pauseJobMutation = useMutation(
    trpc.jobs.pause.mutationOptions({
      onSuccess: async () => {
        await refreshJobs();
        toast.success('Job paused');
      },
      onError: (error) => showMutationError(error, 'Unable to pause job.'),
    }),
  );
  const resumeJobMutation = useMutation(
    trpc.jobs.resume.mutationOptions({
      onSuccess: async () => {
        await refreshJobs();
        toast.success('Job resumed');
      },
      onError: (error) => showMutationError(error, 'Unable to resume job.'),
    }),
  );
  const cancelJobMutation = useMutation(
    trpc.jobs.cancel.mutationOptions({
      onSuccess: async () => {
        await refreshJobs();
        toast.success('Job cancelled');
      },
      onError: (error) => showMutationError(error, 'Unable to cancel job.'),
    }),
  );
  const uncancelJobMutation = useMutation(
    trpc.jobs.uncancel.mutationOptions({
      onSuccess: async () => {
        await refreshJobs();
        toast.success('Job uncancelled');
      },
      onError: (error) => showMutationError(error, 'Unable to uncancel job.'),
    }),
  );
  const isTransitionPending =
    startStageMutation.isPending ||
    completeStageMutation.isPending ||
    startStationBookingMutation.isPending ||
    stopStationBookingMutation.isPending ||
    pauseJobMutation.isPending ||
    resumeJobMutation.isPending ||
    cancelJobMutation.isPending ||
    uncancelJobMutation.isPending;
  const canUpdateJob = hasPermission(accessQuery.data, 'job:update');
  const canOpenQuotes =
    hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');
  const confirmPauseJob = (id: UUID) => {
    setConfirmation({
      body: [
        'This will pause the Job for everyone. Department managers will not be able to start work or mark their part as complete until a supervisor resumes it.',
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
        'The Job will stay visible, along with its history. A supervisor can uncancel it later if work should continue.',
      ],
      confirmLabel: 'Cancel job',
      confirmVariant: 'destructive',
      onConfirm: () => cancelJobMutation.mutate({ id }),
      title: 'Cancel job?',
    });
  };
  const confirmCompleteStageTransition = (input: JobStageTransitionInput, onConfirm: () => void) => {
    const isFinalStage = input.stage === FINAL_JOB_STAGE;
    const finalStageLabel = stageLabels[FINAL_JOB_STAGE];

    setConfirmation({
      body: isFinalStage
        ? [
            `This will complete ${finalStageLabel} and mark the whole Job as complete.`,
            'The Job status will be derived from that completion date unless it is paused or cancelled later.',
            'The existing Job history will stay as it is.',
          ]
        : [
            `This will mark ${stageLabels[input.stage]}'s part of the Job as complete.`,
            'The next department will be able to start handling the Job.',
            `${stageLabels[input.stage]} will stay completed. A supervisor can correct the recorded actual dates later if needed.`,
          ],
      confirmLabel: isFinalStage ? 'Complete job' : `Complete ${stageLabels[input.stage]}`,
      confirmVariant: 'default',
      onConfirm,
      title: isFinalStage ? `Complete ${finalStageLabel} and finish job?` : `Complete ${stageLabels[input.stage]}?`,
    });
  };
  const confirmCompleteStage = (input: JobStageTransitionInput) => {
    confirmCompleteStageTransition(input, () => completeStageMutation.mutate(input));
  };
  return (
    <DetailPageLayout
      aside={job ? <WorkflowHistory events={job.workflowEvents} /> : undefined}
      back={<BackButton to="/jobs">Jobs</BackButton>}
      badge={job ? <JobLifecycleStatusBadge status={job.lifecycleStatus} /> : undefined}
      description={job?.productModelCode}
      title={job?.productName}
    >
      <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
      {job ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <JobFact label="Created" value={<DateDisplay date={job.createdAt} />} />
            <JobFact label="Due date" value={<DateDisplay date={job.dueEnd} emptyValue="No date" />} />
            <JobFact label="Updated" value={<DateDisplay date={job.updatedAt} />} />
            <JobFact
              label="Quote"
              value={<JobQuoteLink canOpenQuote={canOpenQuotes} quoteCode={job.quoteCode} quoteId={job.quoteId} />}
            />
          </div>
          {canUpdateJob ? (
            <LifecycleControls
              isPending={isTransitionPending}
              lifecycleStatus={job.lifecycleStatus}
              isCancelled={job.isCancelled}
              isPaused={job.isPaused}
              onCancel={() => confirmCancelJob(job.id)}
              onPause={() => confirmPauseJob(job.id)}
              onResume={() => resumeJobMutation.mutate({ id: job.id })}
              onUncancel={() => uncancelJobMutation.mutate({ id: job.id })}
            />
          ) : null}
          {job.isPaused || job.isCancelled ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              Department controls are disabled while this job is {jobLifecycleStatusLabels[job.lifecycleStatus]}.
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-5">
            {job.stages.map((stage) => (
              <StagePanel
                isPending={isTransitionPending}
                jobId={job.id}
                key={`${stage.sequence}-${stage.stage}`}
                onComplete={confirmCompleteStage}
                onStartStationBooking={(input) => startStationBookingMutation.mutate(input)}
                onStart={(input) => startStageMutation.mutate(input)}
                onStopStationBooking={(input) => stopStationBookingMutation.mutate(input)}
                stage={stage}
              />
            ))}
          </div>
        </>
      ) : null}
      {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
      <JobTransitionConfirmationDialog
        confirmation={confirmation}
        isPending={isTransitionPending}
        onClose={() => setConfirmation(null)}
      />
    </DetailPageLayout>
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
