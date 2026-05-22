import { hasPermission, jobStatusLabels } from '@pkg/domain';
import type { JobDetail, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { useAppForm } from '@/components/form/index.js';
import { DetailPageLayout } from '@/components/page-layout/DetailPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobStatusBadge } from '../jobs/components/JobStatusBadge.js';
import { JobFact } from './components/JobFact.js';
import { ScheduleGantt } from './components/ScheduleGantt.js';
import { StagePanel } from './components/StagePanel.js';
import { WorkflowHistory } from './components/WorkflowHistory.js';

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
  const refreshJobs = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() });
  };
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
  const editDueDateMutation = useMutation(
    trpc.jobs.editDate.mutationOptions({
      onSuccess: async () => {
        await refreshJobs();
        toast.success('Job Due Date updated');
      },
      onError: (error) => showMutationError(error, 'Unable to update Job Due Date.'),
    }),
  );
  const isTransitionPending =
    startStationBookingMutation.isPending || stopStationBookingMutation.isPending || editDueDateMutation.isPending;
  const canUpdateJob = hasPermission(accessQuery.data, 'job:update');
  const canOpenQuotes =
    hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');
  return (
    <DetailPageLayout
      aside={job ? <WorkflowHistory events={job.workflowEvents} /> : undefined}
      back={<BackButton to="/jobs">Jobs</BackButton>}
      badge={job ? <JobStatusBadge status={job.status} /> : undefined}
      description={job?.productModelCode}
      title={job?.productName}
    >
      <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
      {job ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <JobFact label="Job code" value={<span className="font-medium">{job.code}</span>} />
            <JobFact label="Customer" value={job.customerCompanyName ?? 'Stock build'} />
            <JobFact label="Created" value={<DateDisplay date={job.createdAt} />} />
            <JobFact label="Updated" value={<DateDisplay date={job.updatedAt} />} />
            <JobFact
              label="Job Due Date"
              value={
                canUpdateJob ? (
                  <JobDueDateEditor
                    dueDate={job.dueDate}
                    isPending={editDueDateMutation.isPending}
                    onSubmit={(value) =>
                      editDueDateMutation.mutate({
                        entityId: job.id,
                        entityLevel: 'job',
                        field: 'due_date',
                        value,
                      })
                    }
                  />
                ) : (
                  <DateDisplay date={job.dueDate} emptyValue="No date" />
                )
              }
            />
            <JobFact
              label="Quote"
              value={<JobQuoteLink canOpenQuote={canOpenQuotes} quoteCode={job.quoteCode} quoteId={job.quoteId} />}
            />
          </div>
          {job.status !== 'active' ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              Department controls are disabled while this job is {jobStatusLabels[job.status]}.
            </div>
          ) : null}
          <ScheduleGantt canEditSchedule={canUpdateJob} job={job} />
          <div className="grid gap-3 lg:grid-cols-5">
            {job.stages.map((stage) => (
              <StagePanel
                canTransitionStationBooking={job.status === 'active'}
                isPending={isTransitionPending}
                key={`${stage.sequence}-${stage.stage}`}
                onStartStationBooking={(input) => startStationBookingMutation.mutate(input)}
                onStopStationBooking={(input) => stopStationBookingMutation.mutate(input)}
                stage={stage}
              />
            ))}
          </div>
        </>
      ) : null}
      {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
    </DetailPageLayout>
  );
};

const JobDueDateEditor: React.FC<{
  dueDate: string | null;
  isPending: boolean;
  onSubmit: (value: string | null) => void;
}> = ({ dueDate, isPending, onSubmit }) => {
  const form = useAppForm({
    defaultValues: {
      dueDate: dueDate ?? '',
    },
    onSubmit: async ({ value }) => {
      const nextDueDate = value.dueDate || null;
      if (nextDueDate === dueDate) return;

      onSubmit(nextDueDate);
      form.reset(value);
    },
  });

  React.useEffect(() => {
    form.reset({ dueDate: dueDate ?? '' });
  }, [dueDate, form]);

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="min-w-0 flex-1">
        <form.AppField name="dueDate">
          {(field) => (
            <field.DatePickerField
              clearable
              disabled={isPending}
              label={<span className="sr-only">Job Due Date</span>}
            />
          )}
        </form.AppField>
      </div>
      <form.Subscribe selector={(state) => state.values.dueDate}>
        {(value) => (
          <Button
            aria-label="Save Job Due Date"
            disabled={(value || null) === dueDate || isPending}
            size="icon-sm"
            type="submit"
          >
            <CheckIcon />
          </Button>
        )}
      </form.Subscribe>
    </form>
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
